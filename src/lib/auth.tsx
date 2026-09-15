import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Busca o perfil e, de quebra, serve de prova de que o token ainda vale — é
 * uma chamada de verdade ao servidor, passando pelo RLS.
 *
 * `confiavel` diz se dá pra liberar o app. Falha de rede não derruba ninguém
 * (o app é instalável e pode abrir sem sinal); o que derruba é o servidor
 * responder que aquele token não serve mais.
 */
async function fetchProfile(
  userId: string,
): Promise<{ profile: Profile | null; confiavel: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, active, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth] erro ao buscar perfil:", error.message);
    const semRede = typeof navigator !== "undefined" && navigator.onLine === false;
    return { profile: null, confiavel: semRede };
  }
  return { profile: (data as Profile) ?? null, confiavel: !!data };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    /**
     * Só publica a sessão depois de confirmar com o servidor que ela vale.
     *
     * O aparelho guarda a sessão no localStorage, e o `getSession` devolve ela
     * na hora, sem perguntar nada a ninguém. Se essa sessão já não servir mais
     * (senha trocada, acesso revogado, refresh token vencido), o jeito antigo
     * liberava o painel e só depois caía no login — era o "pisca e volta".
     * Aqui a sessão e o perfil entram juntos, num estado só.
     */
    const aplicar = async (s: Session | null) => {
      if (!active) return;

      if (!s?.user) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const { profile: p, confiavel } = await fetchProfile(s.user.id);
      if (!active) return;

      if (!confiavel) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        // Limpa o localStorage, senão repete tudo no próximo abrir.
        void supabase.auth.signOut();
        return;
      }

      setSession(s);
      setProfile(p);
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      void aplicar(s);
    });
    void supabase.auth.getSession().then(({ data }) => aplicar(data.session));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadProfileFor = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      return;
    }
    const { profile: p } = await fetchProfile(s.user.id);
    setProfile(p);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      const msg =
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message;
      return { error: msg };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfileFor(session);
  }, [loadProfileFor, session]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      isAdmin: profile?.role === "admin" && profile?.active === true,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
