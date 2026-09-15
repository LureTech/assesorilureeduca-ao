import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, Mail, Eye, EyeOff, ArrowRight, Loader2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/supabase";
import lureLogo from "@/assets/lure-logo-large.png.asset.json";

/** WhatsApp do administrador — botão "Fale com o administrador". */
const ADMIN_WHATSAPP =
  "https://wa.me/5585991112424?text=" +
  encodeURIComponent(
    "Olá! Não tenho acesso à Área de Membros da Lure Digital e gostaria de solicitar meu login.",
  );

/** WhatsApp para redefinição de senha (contas são gerenciadas pelo admin). */
const FORGOT_WHATSAPP =
  "https://wa.me/5585991112424?text=" +
  encodeURIComponent(
    "Olá! Esqueci minha senha da Área de Membros da Lure Digital e preciso redefinir o acesso.",
  );

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — LURE Growth" },
      { name: "description", content: "Acesso à área de membros da Lure Digital." },
    ],
  }),
  component: LoginPage,
});

/** Estágios: 'intro' (só a logo animando) → 'app' (login revela) → splash some. */
type Phase = "intro" | "app";

function LoginPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("app"), 2300);
    const t2 = window.setTimeout(() => setSplashGone(true), 3050);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {phase === "app" && <LoginLayout />}
      {!splashGone && <IntroSplash leaving={phase === "app"} />}
    </div>
  );
}

/* ───────────────────────── Intro: reveal da logo ───────────────────────── */
function IntroSplash({ leaving }: { leaving: boolean }) {
  return (
    <div
      className={`lure-grain absolute inset-0 z-50 grid place-items-center bg-background ${
        leaving ? "lure-splash-out pointer-events-none" : ""
      }`}
    >
      {/* auroras suaves de fundo */}
      <div
        className="lure-aurora lure-aurora-a"
        style={{ width: 460, height: 460, top: "14%", left: "50%", marginLeft: -230, background: "rgba(187, 154, 53, 0.16)" }}
      />

      <div className="relative flex flex-col items-center">
        {/* bloom + anel pulsante atrás da logo */}
        <div className="relative grid place-items-center">
          <div
            className="lure-bloom absolute h-56 w-56 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(212, 184, 92, 0.55), transparent 65%)", filter: "blur(18px)" }}
          />
          <div className="lure-ring-pulse absolute h-28 w-28 rounded-full border border-primary/40" />
          <img
            src={lureLogo.url}
            alt="LURE"
            className="lure-logo-in relative h-24 w-24 rounded-full object-contain"
          />
        </div>

        {/* wordmark */}
        <div className="lure-track-in mt-7 font-display text-3xl font-bold text-white" style={{ letterSpacing: "0.2em" }}>
          LURE
        </div>
        <div className="lure-line-draw mt-3 h-px lure-hairline" />
        <div
          className="lure-rise mt-3 text-[11px] uppercase tracking-[0.42em] text-white/55"
          style={{ ["--d" as string]: "1100ms" }}
        >
          Growth
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Login (revela após a intro) ───────────────────────── */
function LoginLayout() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error);
    // Em caso de sucesso, o AuthGate redireciona automaticamente para a Home.
  };

  return (
    <div className="min-h-screen">
      {/* ─────────── Formulário centralizado ─────────── */}
      <main className="relative flex min-h-screen items-center justify-center px-6 py-14 sm:px-10">
        <div className="lure-aurora lure-aurora-a" style={{ width: 420, height: 420, top: "-8%", right: "-6%", background: "rgba(187, 154, 53, 0.16)" }} />
        <div className="lure-aurora lure-aurora-b" style={{ width: 360, height: 360, bottom: "-10%", left: "-8%", background: "rgba(212, 184, 92, 0.12)" }} />

        <div className="relative w-full max-w-md">
          {/* Logo (centralizada, acima do cartão) */}
          <div className="lure-rise mb-9 flex flex-col items-center gap-3 text-center" style={{ ["--d" as string]: "40ms" }}>
            <img src={lureLogo.url} alt="LURE" className="h-16 w-16 rounded-full object-contain" />
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-[0.18em]">LURE</div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">Growth</div>
            </div>
          </div>

          {/* Cartão de vidro */}
          <div className="lure-rise relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 shadow-[var(--shadow-card)] backdrop-blur-xl sm:p-10" style={{ ["--d" as string]: "120ms" }}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

            <h1 className="lure-rise font-display text-3xl font-bold tracking-tight" style={{ ["--d" as string]: "220ms" }}>
              Bem-vindo de volta
            </h1>
            <p className="lure-rise mt-2 text-sm text-muted-foreground" style={{ ["--d" as string]: "280ms" }}>
              Entre com seu e-mail e senha para acessar a plataforma.
            </p>
            {isDemoMode && (
              <p
                className="lure-rise mt-4 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs text-primary"
                style={{ ["--d" as string]: "300ms" }}
              >
                Modo demo, sem banco: qualquer e-mail e senha entram.
              </p>
            )}

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              {/* E-mail */}
              <div className="lure-rise" style={{ ["--d" as string]: "340ms" }}>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mail</label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:bg-white/[0.06] focus:ring-4 focus:ring-primary/10"
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="lure-rise" style={{ ["--d" as string]: "400ms" }}>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Senha</label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <input
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-11 text-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:bg-white/[0.06] focus:ring-4 focus:ring-primary/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              {/* Manter-me conectado + Esqueceu a senha */}
              <div className="lure-rise flex items-center justify-between pt-0.5" style={{ ["--d" as string]: "440ms" }}>
                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`grid h-[18px] w-[18px] place-items-center rounded-md border transition ${
                      remember
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/20 bg-white/[0.04]"
                    }`}
                  >
                    {remember && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  Manter-me conectado
                </label>
                <a
                  href={FORGOT_WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary/90 underline-offset-4 transition hover:underline"
                >
                  Esqueceu a senha?
                </a>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-red-300">
                  <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-destructive/30 text-[10px] font-bold">!</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="lure-rise group relative mt-1 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl gradient-gold px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110 hover:shadow-[0_0_50px_-6px_rgba(187, 154, 53, 0.55)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ ["--d" as string]: "460ms" }}
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Entrando…
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="lure-rise mt-7 text-center text-sm text-muted-foreground" style={{ ["--d" as string]: "520ms" }}>
              Não tem acesso?{" "}
              <a
                href={ADMIN_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline-offset-4 transition hover:underline"
              >
                Fale com o administrador
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
