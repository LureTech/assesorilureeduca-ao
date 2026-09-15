/**
 * Service worker do LURE Growth: notificações push e cache de imagem.
 *
 * Regra de ouro daqui: um listener de `fetch` faz TODA requisição do site
 * passar pela thread do service worker antes de ir pra rede — e, se ele
 * estiver dormindo, o navegador ainda precisa acordá-lo primeiro. Por isso só
 * imagem entra aqui. HTML, JavaScript e chamada de API saem na primeira linha
 * e seguem direto, como se o service worker não existisse.
 */

const VERSAO = "v2"; // mudar aqui joga fora o cache antigo
const CACHE_IMAGENS = `lure-imagens-${VERSAO}`;
/** Teto conservador: resposta de outro domínio ocupa bem mais espaço que o tamanho real. */
const MAX_IMAGENS = 80;

const ICON = "/pwa-icon-192.png";
const BADGE = "/notification-badge-96.png";

self.addEventListener("install", () => {
  // Assume o controle já na primeira visita, sem esperar fechar as abas antigas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((n) => n.startsWith("lure-") && n !== CACHE_IMAGENS)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------------------------------------------ */
/* Cache de imagem                                                      */
/* ------------------------------------------------------------------ */

/** Descarta as mais antigas quando passa do teto. */
async function aparar(cache) {
  const chaves = await cache.keys();
  const sobrando = chaves.length - MAX_IMAGENS;
  if (sobrando <= 0) return;
  for (const chave of chaves.slice(0, sobrando)) await cache.delete(chave);
}

/**
 * Só imagem do nosso próprio domínio entra no cache.
 *
 * De outro domínio (thumbnail do YouTube, foto do Supabase) a resposta vem
 * "opaca": o navegador não deixa ler nem o status. Não dá pra saber se veio a
 * imagem ou um 404 — e guardar um 404 como se fosse imagem boa deixa a falha
 * grudada no aparelho. Melhor deixar essas passarem direto pra rede.
 */
function ehImagemNossa(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.destination === "image") return true;
  return /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i.test(url.pathname);
}

async function servirImagem(event, request) {
  const cache = await caches.open(CACHE_IMAGENS);
  const guardada = await cache.match(request);

  const rede = fetch(request)
    .then(async (resposta) => {
      // Só o que deu certo de verdade. Aqui é tudo do nosso domínio, então o
      // status é legível — nada de guardar erro achando que é imagem.
      if (resposta && resposta.ok) {
        try {
          await cache.put(request, resposta.clone());
          await aparar(cache);
        } catch {
          // Sem espaço no aparelho: serve a imagem mesmo assim.
        }
      }
      return resposta;
    })
    .catch(() => null);

  // Se já tem no cache, devolve na hora e atualiza por baixo — assim uma
  // imagem trocada no servidor aparece na próxima visita sem travar esta.
  if (guardada) {
    event.waitUntil(rede);
    return guardada;
  }
  return (await rede) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode === "navigate") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (!url.protocol.startsWith("http")) return;
  if (!ehImagemNossa(request, url)) return;

  event.respondWith(servirImagem(event, request));
});

/* ------------------------------------------------------------------ */
/* Notificações                                                         */
/* ------------------------------------------------------------------ */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data && event.data.text() };
  }

  const title = payload.title || "LURE Growth";
  const options = {
    body: payload.body || "",
    icon: payload.icon || ICON,
    badge: BADGE,
    // Mesma tag = a notificação nova substitui a anterior em vez de empilhar.
    tag: payload.tag || "lure",
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  );

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Se o app já está aberto, navega a aba existente em vez de abrir outra.
      for (const client of clients) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          return client.focus().then((c) => (c.navigate ? c.navigate(target.href) : c));
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
