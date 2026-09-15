/**
 * Envio de notificações push do LURE Growth.
 *
 * Ações (POST, corpo JSON):
 *  - { action: "daily" }   → roda a rotina do dia. Só com o header x-lure-secret
 *                            (é o pg_cron que chama, de hora em hora).
 *  - { action: "notify", user_ids, title, body, url, kind }
 *                          → disparo avulso. Também exige x-lure-secret.
 *  - { action: "test" }    → manda uma notificação de teste pro próprio usuário.
 *                            Exige o Authorization: Bearer <jwt> do aluno logado.
 *
 * verify_jwt fica desligado porque a chamada do cron não tem JWT; a autenticação
 * é feita aqui dentro, por segredo compartilhado ou validando o token do aluno.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush, type Subscription, type Vapid } from "./webpush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lure-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

type Message = { kind: string; title: string; body: string; url: string };

async function loadConfig() {
  const { data, error } = await admin
    .from("push_config")
    .select("vapid_public, vapid_private, subject, cron_secret")
    .eq("id", 1)
    .single();
  if (error || !data)
    throw new Error("push_config não configurado: " + (error?.message ?? "vazio"));
  return {
    vapid: {
      publicKey: data.vapid_public,
      privateKey: data.vapid_private,
      subject: data.subject,
    } as Vapid,
    cronSecret: data.cron_secret as string,
  };
}

/**
 * Entrega uma mensagem em todos os aparelhos do aluno e registra no histórico.
 * Inscrição morta é apagada na hora; falha temporária só incrementa o contador.
 */
async function deliver(userId: string, msg: Message, vapid: Vapid) {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return { sent: 0, failed: 0 };

  const payload = { title: msg.title, body: msg.body, url: msg.url, tag: msg.kind };
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s) => {
      const result = await sendPush(s as Subscription, payload, vapid);
      if (result.ok) {
        sent++;
        await admin
          .from("push_subscriptions")
          .update({ last_ok_at: new Date().toISOString(), failures: 0 })
          .eq("endpoint", s.endpoint);
        return;
      }
      failed++;
      if (result.gone) {
        await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      } else {
        const { data: row } = await admin
          .from("push_subscriptions")
          .select("failures")
          .eq("endpoint", s.endpoint)
          .single();
        const failures = (row?.failures ?? 0) + 1;
        // Depois de 10 tentativas seguidas sem sucesso, para de insistir.
        if (failures >= 10) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          await admin.from("push_subscriptions").update({ failures }).eq("endpoint", s.endpoint);
        }
      }
    }),
  );

  if (sent > 0) {
    await admin.from("notification_log").insert({
      user_id: userId,
      kind: msg.kind,
      title: msg.title,
      body: msg.body,
      url: msg.url,
    });
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo JSON inválido." }, 400);
  }

  const action = String(payload.action ?? "");

  let config;
  try {
    config = await loadConfig();
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  const secret = req.headers.get("x-lure-secret") ?? "";
  const trusted = config.cronSecret.length > 0 && secret === config.cronSecret;

  // ---- rotina diária (pg_cron) ----
  if (action === "daily") {
    if (!trusted) return json({ error: "Não autorizado." }, 401);

    const { data: pending, error } = await admin.rpc("pending_daily_notifications");
    if (error) return json({ error: error.message }, 500);

    let sent = 0;
    let failed = 0;
    for (const row of pending ?? []) {
      const r = await deliver(
        row.user_id,
        { kind: row.kind, title: row.title, body: row.body, url: row.url },
        config.vapid,
      );
      sent += r.sent;
      failed += r.failed;
    }
    return json({ ok: true, alunos: pending?.length ?? 0, sent, failed });
  }

  // ---- disparo avulso (admin/automação) ----
  if (action === "notify") {
    if (!trusted) return json({ error: "Não autorizado." }, 401);
    const ids = Array.isArray(payload.user_ids) ? (payload.user_ids as string[]) : [];
    const msg: Message = {
      kind: String(payload.kind ?? "avulso"),
      title: String(payload.title ?? "LURE Growth"),
      body: String(payload.body ?? ""),
      url: String(payload.url ?? "/"),
    };
    let sent = 0;
    let failed = 0;
    for (const id of ids) {
      const r = await deliver(id, msg, config.vapid);
      sent += r.sent;
      failed += r.failed;
    }
    return json({ ok: true, sent, failed });
  }

  // ---- teste do próprio aparelho ----
  if (action === "test") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Faça login primeiro." }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: "Sessão inválida." }, 401);

    const r = await deliver(
      userData.user.id,
      {
        kind: "teste",
        title: "Deu certo",
        body: "É assim que os avisos da Lure vão chegar pra você.",
        url: "/",
      },
      config.vapid,
    );
    return json({ ok: r.sent > 0, ...r });
  }

  return json({ error: "Ação desconhecida." }, 400);
});
