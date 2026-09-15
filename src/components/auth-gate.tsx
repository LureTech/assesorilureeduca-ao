import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Ban } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Rotas que podem ser abertas sem login. */
const PUBLIC_PATHS = new Set(["/login"]);
/** Rotas que exigem papel de administrador. */
const ADMIN_PREFIXES = ["/admin"];

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    </div>
  );
}

function BlockedScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-400">
          <Ban className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-display text-xl font-bold">Acesso bloqueado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta está sem acesso no momento. Fale com o administrador para liberar.
        </p>
        <button
          onClick={onSignOut}
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:bg-muted"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, profile, isAdmin, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const isPublic = PUBLIC_PATHS.has(pathname);
  const needsAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const blocked = !!session && !!profile && profile.active === false;

  useEffect(() => {
    if (loading) return;
    if (!session && !isPublic) {
      navigate({ to: "/login", replace: true });
    } else if (session && pathname === "/login") {
      navigate({ to: "/", replace: true });
    } else if (session && needsAdmin && !isAdmin) {
      navigate({ to: "/", replace: true });
    }
  }, [loading, session, isAdmin, isPublic, needsAdmin, pathname, navigate]);

  // Enquanto resolve a sessão, ou durante um redirecionamento, mostra o splash
  // para nunca "piscar" conteúdo protegido.
  if (loading) return <Splash />;
  if (blocked && !isPublic) {
    return (
      <BlockedScreen
        onSignOut={() => {
          void signOut().then(() => navigate({ to: "/login", replace: true }));
        }}
      />
    );
  }
  if (!session && !isPublic) return <Splash />;
  if (session && pathname === "/login") return <Splash />;
  if (session && needsAdmin && !isAdmin) return <Splash />;

  return <>{children}</>;
}
