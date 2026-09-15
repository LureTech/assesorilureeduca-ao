import { supabase } from "./supabase";

/**
 * Notificações push do app.
 *
 * O fluxo é: registra o service worker → pede a permissão do navegador →
 * cria a inscrição com a chave VAPID → guarda no Supabase. O envio em si é
 * feito pela Edge Function `push` (e pelo pg_cron, de hora em hora).
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type NotificationPrefs = {
  user_id: string;
  enabled: boolean;
  daily_reminder: boolean;
  community: boolean;
  replies: boolean;
  new_content: boolean;
  hour: number;
};

export const DEFAULT_PREFS: Omit<NotificationPrefs, "user_id"> = {
  enabled: true,
  daily_reminder: true,
  community: true,
  replies: true,
  new_content: true,
  hour: 19,
};

/** Chave VAPID em base64url → bytes, formato que o `subscribe` exige. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToBase64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPad moderno se identifica como Mac; o toque é o que denuncia.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** No iOS o push só funciona com o app instalado na tela de início. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export type PushSupport =
  { ok: true } | { ok: false; reason: "sem-suporte" | "precisa-instalar" | "sem-chave" };

export function checkSupport(): PushSupport {
  if (typeof window === "undefined") return { ok: false, reason: "sem-suporte" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "sem-chave" };

  const hasApi =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // O Safari do iPhone só expõe a API depois de instalado — mas checamos antes
  // pra conseguir explicar o motivo em vez de dizer "não suportado".
  if (isIOS() && !isStandalone()) return { ok: false, reason: "precisa-instalar" };
  if (!hasApi) return { ok: false, reason: "sem-suporte" };
  return { ok: true };
}

export function permission(): NotificationPermission | "indisponivel" {
  if (typeof window === "undefined" || !("Notification" in window)) return "indisponivel";
  return Notification.permission;
}

let registration: Promise<ServiceWorkerRegistration> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!registration) {
    registration = navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }
  return registration;
}

/** Salva (ou atualiza) a inscrição deste aparelho na conta do aluno. */
async function saveSubscription(sub: PushSubscription, userId: string) {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh ?? bufferToBase64url(sub.getKey("p256dh"));
  const auth = json.keys?.auth ?? bufferToBase64url(sub.getKey("auth"));
  if (!p256dh || !auth) throw new Error("O navegador não devolveu as chaves da inscrição.");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}

export type EnableResult =
  | { ok: true }
  | {
      ok: false;
      reason: "negado" | "erro" | "precisa-instalar" | "sem-suporte" | "sem-chave";
      message?: string;
    };

/**
 * Pede a permissão e deixa o aparelho pronto pra receber. Precisa ser chamada
 * a partir de um clique — navegador nenhum aceita o pedido fora de um gesto.
 */
export async function enablePush(
  userId: string,
  prefs?: Partial<Omit<NotificationPrefs, "user_id">>,
): Promise<EnableResult> {
  const support = checkSupport();
  if (!support.ok) return { ok: false, reason: support.reason };

  try {
    const result = await Notification.requestPermission();
    if (result !== "granted") return { ok: false, reason: "negado" };

    const reg = await registerServiceWorker();
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      }));

    await saveSubscription(sub, userId);
    await savePrefs(userId, { ...DEFAULT_PREFS, ...prefs, enabled: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "erro", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Mantém o banco alinhado com o aparelho a cada abertura do app: se a inscrição
 * mudou (o navegador troca de vez em quando) ou sumiu, corrige sem incomodar
 * o aluno. Não pede permissão nova.
 */
export async function syncSubscription(userId: string): Promise<void> {
  if (!checkSupport().ok || permission() !== "granted") return;
  try {
    const reg = await registerServiceWorker();
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      }));
    await saveSubscription(sub, userId);
  } catch (e) {
    console.warn("[push] não deu pra sincronizar a inscrição:", e);
  }
}

/** Desliga neste aparelho: cancela no navegador e apaga do banco. */
export async function disablePush(userId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    console.warn("[push] erro ao cancelar a inscrição:", e);
  }
  await savePrefs(userId, { enabled: false });
}

export async function loadPrefs(userId: string): Promise<NotificationPrefs | null> {
  const { data } = await supabase
    .from("notification_prefs")
    .select("user_id, enabled, daily_reminder, community, replies, new_content, hour")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as NotificationPrefs) ?? null;
}

/**
 * Grava só o que foi passado. As colunas ausentes ficam no default do banco
 * quando é a primeira vez, e intactas quando a linha já existe.
 */
export async function savePrefs(
  userId: string,
  patch: Partial<Omit<NotificationPrefs, "user_id">>,
): Promise<void> {
  const { error } = await supabase
    .from("notification_prefs")
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(error.message);
}

/** Dispara uma notificação de teste no próprio aparelho. */
export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, message: "Sessão expirada. Entre de novo." };

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "test" }),
    });
    const data = await res.json();
    if (data.ok) return { ok: true, message: "Enviamos uma notificação de teste." };
    return { ok: false, message: data.error ?? "Nenhum aparelho recebeu. Ative as notificações." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao chamar o servidor." };
  }
}
