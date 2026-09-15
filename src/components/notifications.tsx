import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2, Share, PlusSquare, X, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_PREFS,
  checkSupport,
  disablePush,
  enablePush,
  isIOS,
  loadPrefs,
  permission,
  registerServiceWorker,
  savePrefs,
  sendTestNotification,
  syncSubscription,
  type NotificationPrefs,
} from "@/lib/push";

/* ------------------------------------------------------------------ */
/* Tipos de aviso oferecidos ao aluno                                   */
/* ------------------------------------------------------------------ */

type PrefKey = "daily_reminder" | "community" | "replies" | "new_content";

const TIPOS: { key: PrefKey; label: string; hint: string }[] = [
  {
    key: "daily_reminder",
    label: "Lembrete diário de estudo",
    hint: "Uma vez por dia, no horário que você escolher.",
  },
  {
    key: "community",
    label: "Novidades da comunidade",
    hint: "Quando o feed movimenta e vale a pena entrar.",
  },
  {
    key: "replies",
    label: "Respostas e curtidas",
    hint: "Quando alguém interage com o que você publicou.",
  },
  {
    key: "new_content",
    label: "Aula ou módulo novo",
    hint: "Assim que a Lure publica conteúdo inédito.",
  },
];

const HORARIOS = [7, 8, 9, 12, 18, 19, 20, 21, 22];

/* ------------------------------------------------------------------ */
/* Peças reaproveitadas                                                 */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50 ${
        checked ? "border-primary/50 gradient-gold" : "border-border bg-surface"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

function ListaDeTipos({
  prefs,
  onChange,
  disabled,
}: {
  prefs: Omit<NotificationPrefs, "user_id">;
  onChange: (patch: Partial<Omit<NotificationPrefs, "user_id">>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col divide-y divide-border/50">
      {TIPOS.map((t) => (
        <label key={t.key} className="flex items-start justify-between gap-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t.label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {t.hint}
            </span>
          </span>
          <Toggle
            checked={prefs[t.key]}
            disabled={disabled}
            onChange={(v) => onChange({ [t.key]: v })}
          />
        </label>
      ))}
    </div>
  );
}

function SeletorDeHorario({
  hour,
  onChange,
  disabled,
}: {
  hour: number;
  onChange: (h: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Horário do lembrete diário
      </div>
      <div className="flex flex-wrap gap-1.5">
        {HORARIOS.map((h) => (
          <button
            key={h}
            type="button"
            disabled={disabled}
            onClick={() => onChange(h)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium tabular-nums transition disabled:opacity-50 ${
              hour === h
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {String(h).padStart(2, "0")}h
          </button>
        ))}
      </div>
    </div>
  );
}

/** Instruções pro iPhone, onde o push exige o app instalado na tela de início. */
function ComoInstalarNoIphone() {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4 text-sm">
      <p className="text-muted-foreground">
        No iPhone as notificações só funcionam com o app instalado. É rápido:
      </p>
      <ol className="mt-3 space-y-2 text-[13px]">
        <li className="flex items-center gap-2">
          <Share className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Toque em <strong>Compartilhar</strong>, na barra do Safari.
          </span>
        </li>
        <li className="flex items-center gap-2">
          <PlusSquare className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Escolha <strong>Adicionar à Tela de Início</strong>.
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Bell className="h-4 w-4 shrink-0 text-primary" />
          <span>Abra pelo ícone novo e ative os avisos por aqui.</span>
        </li>
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card que aparece depois do login                                     */
/* ------------------------------------------------------------------ */

const ADIADO_EM = "lure:push-adiado-em";
const ESPERA_MS = 7 * 24 * 60 * 60 * 1000; // volta a perguntar depois de uma semana

function adiadoRecentemente() {
  try {
    const t = Number(localStorage.getItem(ADIADO_EM) ?? 0);
    return t > 0 && Date.now() - t < ESPERA_MS;
  } catch {
    return false;
  }
}

export function NotificationPrompt() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [visivel, setVisivel] = useState(false);
  const [precisaInstalar, setPrecisaInstalar] = useState(false);
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // Registra o service worker sempre: é ele que torna o app instalável,
    // mesmo pra quem nunca vai ligar notificação.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void registerServiceWorker().catch((e) =>
        console.warn("[push] service worker não registrou:", e),
      );
    }

    // Aparelho que já autorizou: só realinha a inscrição, sem incomodar.
    if (permission() === "granted") {
      void syncSubscription(userId);
      return;
    }
    if (permission() === "denied" || adiadoRecentemente()) return;

    const suporte = checkSupport();
    if (!suporte.ok && suporte.reason !== "precisa-instalar") return;

    // Um respiro depois do login, pra não cair em cima da tela inicial.
    const t = setTimeout(() => {
      setPrecisaInstalar(!suporte.ok);
      setVisivel(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [userId]);

  const adiar = () => {
    try {
      localStorage.setItem(ADIADO_EM, String(Date.now()));
    } catch {
      /* navegação privada: tudo bem, pergunta de novo na próxima */
    }
    setVisivel(false);
  };

  const ativar = async () => {
    if (!userId) return;
    setSalvando(true);
    setErro(null);
    const r = await enablePush(userId, prefs);
    setSalvando(false);

    if (r.ok) {
      setPronto(true);
      setTimeout(() => setVisivel(false), 1600);
      return;
    }
    if (r.reason === "negado") {
      setErro(
        "Você bloqueou os avisos. Pra liberar, toque no cadeado ao lado do endereço e permita notificações.",
      );
      return;
    }
    if (r.reason === "precisa-instalar") {
      setPrecisaInstalar(true);
      return;
    }
    setErro(r.message ?? "Não deu pra ativar agora. Tente de novo mais tarde.");
  };

  if (!visivel || !userId) return null;

  return (
    // pointer-events-none no invólucro: ele ocupa a largura toda da tela, e sem
    // isso a faixa inteira do rodapé engolia clique e rolagem da página, mesmo
    // onde não tem card nenhum.
    <div className="dark-scope pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center p-3 sm:p-6">
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)]">
        <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-gold text-primary-foreground">
            {pronto ? <Check className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-bold">
              {pronto ? "Pronto!" : "Quer que a gente te lembre?"}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {pronto
                ? "Você vai receber os avisos escolhidos neste aparelho."
                : "A gente avisa quando tem aula pela metade, conteúdo novo ou movimento na comunidade."}
            </p>
          </div>
          <button
            onClick={adiar}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
            aria-label="Agora não"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!pronto && (
          // overscroll-contain: a rolagem para no fim do card em vez de
          // continuar na página atrás dele.
          <div className="max-h-[55vh] overflow-y-auto overscroll-contain px-5 py-4">
            {precisaInstalar ? (
              <ComoInstalarNoIphone />
            ) : (
              <>
                <ListaDeTipos
                  prefs={prefs}
                  disabled={salvando}
                  onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
                />
                {prefs.daily_reminder && (
                  <div className="mt-4">
                    <SeletorDeHorario
                      hour={prefs.hour}
                      disabled={salvando}
                      onChange={(h) => setPrefs((p) => ({ ...p, hour: h }))}
                    />
                  </div>
                )}
              </>
            )}

            {erro && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-red-400">
                {erro}
              </div>
            )}
          </div>
        )}

        {!pronto && !precisaInstalar && (
          <div className="flex gap-2 border-t border-border/60 px-5 py-4">
            <button
              onClick={adiar}
              disabled={salvando}
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-60"
            >
              Agora não
            </button>
            <button
              onClick={ativar}
              disabled={salvando}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:opacity-70"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              Ativar
            </button>
          </div>
        )}

        {precisaInstalar && !pronto && (
          <div className="border-t border-border/60 px-5 py-4">
            <button
              onClick={adiar}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              Entendi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel dentro das configurações de perfil                            */
/* ------------------------------------------------------------------ */

export function NotificationSettings() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [prefs, setPrefs] = useState<Omit<NotificationPrefs, "user_id"> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  const suporte = checkSupport();
  const permissao = permission();
  const ligado = !!prefs?.enabled && permissao === "granted";

  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    loadPrefs(userId).then((p) => {
      if (!vivo) return;
      setPrefs(p ? { ...p } : { ...DEFAULT_PREFS, enabled: false });
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [userId]);

  const atualizar = useCallback(
    async (patch: Partial<Omit<NotificationPrefs, "user_id">>) => {
      if (!userId || !prefs) return;
      const antes = prefs;
      setPrefs({ ...prefs, ...patch });
      try {
        await savePrefs(userId, patch);
      } catch (e) {
        setPrefs(antes); // desfaz se o banco recusou
        setAviso({ tipo: "err", texto: (e as Error).message });
      }
    },
    [userId, prefs],
  );

  const alternarPush = async (ligar: boolean) => {
    if (!userId) return;
    setOcupado(true);
    setAviso(null);
    if (ligar) {
      const r = await enablePush(userId, prefs ?? undefined);
      if (r.ok) {
        setPrefs((p) => ({ ...(p ?? DEFAULT_PREFS), enabled: true }));
        setAviso({ tipo: "ok", texto: "Notificações ativadas neste aparelho." });
      } else if (r.reason === "negado") {
        setAviso({
          tipo: "err",
          texto: "O navegador bloqueou. Libere as notificações nas permissões do site.",
        });
      } else {
        setAviso({ tipo: "err", texto: r.message ?? "Não foi possível ativar." });
      }
    } else {
      await disablePush(userId);
      setPrefs((p) => ({ ...(p ?? DEFAULT_PREFS), enabled: false }));
      setAviso({ tipo: "ok", texto: "Desativado neste aparelho." });
    }
    setOcupado(false);
  };

  const testar = async () => {
    setOcupado(true);
    const r = await sendTestNotification();
    setAviso({ tipo: r.ok ? "ok" : "err", texto: r.message });
    setOcupado(false);
  };

  if (!userId) return null;

  if (!suporte.ok && suporte.reason === "precisa-instalar") {
    return (
      <section className="mt-6 border-t border-border/60 pt-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Bell className="h-4 w-4 text-primary" /> Notificações
        </h3>
        <ComoInstalarNoIphone />
      </section>
    );
  }

  if (!suporte.ok) {
    return (
      <section className="mt-6 border-t border-border/60 pt-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <BellOff className="h-4 w-4 text-muted-foreground" /> Notificações
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Este navegador não aceita notificações. Abra o app pelo Chrome, Edge ou Safari
          {isIOS() ? " instalado na tela de início" : ""}.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 border-t border-border/60 pt-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="h-4 w-4 text-primary" /> Notificações
        </h3>
        {carregando ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Toggle checked={ligado} disabled={ocupado} onChange={alternarPush} />
        )}
      </div>

      {!carregando && prefs && ligado && (
        <div className="mt-3">
          <ListaDeTipos prefs={prefs} disabled={ocupado} onChange={atualizar} />
          {prefs.daily_reminder && (
            <div className="mt-4">
              <SeletorDeHorario
                hour={prefs.hour}
                disabled={ocupado}
                onChange={(h) => atualizar({ hour: h })}
              />
            </div>
          )}
          <button
            onClick={testar}
            disabled={ocupado}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-primary/40 disabled:opacity-60"
          >
            {ocupado ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar teste
          </button>
        </div>
      )}

      {!carregando && !ligado && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Ative para receber lembretes de estudo, novidades da comunidade e avisos de aula nova.
        </p>
      )}

      {aviso && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
            aviso.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {aviso.texto}
        </div>
      )}
    </section>
  );
}
