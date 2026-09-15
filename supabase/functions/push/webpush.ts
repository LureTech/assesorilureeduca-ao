/**
 * Web Push na unha, só com Web Crypto (sem dependência externa).
 *
 * Duas partes, conforme os RFCs:
 *  - VAPID (RFC 8292): um JWT ES256 que prova pro serviço de push (FCM, Mozilla,
 *    Apple) que o envio veio do nosso servidor.
 *  - Criptografia aes128gcm (RFC 8291): o corpo vai cifrado com uma chave
 *    derivada do par de chaves do navegador. Nem o Google lê o conteúdo.
 */

const enc = new TextEncoder();

export function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** Cabeçalho Authorization no formato VAPID. Vale 12h, então é gerado a cada envio. */
async function vapidAuth(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const signingInput =
    bytesToB64url(enc.encode(JSON.stringify(header))) +
    "." +
    bytesToB64url(enc.encode(JSON.stringify(claims)));

  // A chave pública vem como ponto não comprimido: 0x04 || x(32) || y(32).
  const pub = b64urlToBytes(publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      d: privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)),
  );
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${publicKey}`;
}

/** Cifra o payload com a chave pública do navegador (aes128gcm). */
async function encryptPayload(payload: string, p256dh: string, authSecret: string) {
  const uaPublic = b64urlToBytes(p256dh); // 65 bytes
  const authKey = b64urlToBytes(authSecret); // 16 bytes

  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256),
  );

  // Segredo comum das duas pontas, amarrado às duas chaves públicas.
  const ikm = await hkdf(
    authKey,
    shared,
    concat(enc.encode("WebPush: info\0"), uaPublic, asPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes,
      concat(enc.encode(payload), new Uint8Array([2])), // 0x02 = fim do registro
    ),
  );

  // Cabeçalho do corpo: salt(16) | tamanho do registro(4) | tamanho da chave(1) | chave(65)
  const head = new Uint8Array(21);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPublic.length;

  return concat(head, asPublic, ciphertext);
}

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type Vapid = { publicKey: string; privateKey: string; subject: string };

export type PushResult = { ok: boolean; status: number; gone: boolean; error?: string };

/** Entrega uma notificação em um aparelho. `gone` = inscrição morta, pode apagar. */
export async function sendPush(
  sub: Subscription,
  payload: unknown,
  vapid: Vapid,
): Promise<PushResult> {
  try {
    const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuth(
          sub.endpoint,
          vapid.publicKey,
          vapid.privateKey,
          vapid.subject,
        ),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "normal",
      },
      body,
    });

    // 404/410 = o navegador descartou a inscrição (app desinstalado, permissão revogada).
    const gone = res.status === 404 || res.status === 410;
    return {
      ok: res.ok,
      status: res.status,
      gone,
      error: res.ok ? undefined : (await res.text()).slice(0, 300),
    };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: String(e).slice(0, 300) };
  }
}
