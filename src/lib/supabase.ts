import { createClient } from "@supabase/supabase-js";
import { createDemoClient } from "./supabase-demo";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Sem as variáveis do Supabase o app roda em modo demo: login livre e dados
 * guardados só no navegador (ver supabase-demo.ts). Preencher o .env e
 * reiniciar o `npm run dev` volta pro banco de verdade.
 *
 * Só vale no `npm run dev`, ou num build feito de propósito com
 * `VITE_DEMO_MODE=true` (link de apresentação). Um deploy comum sem as
 * variáveis não pode virar um site onde qualquer senha entra como admin.
 */
const demoPermitido = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true";
export const isDemoMode = demoPermitido && (!url || !anonKey);

if (isDemoMode) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes — rodando em modo demo, sem banco.",
  );
}

// Cliente único do navegador. A sessão é guardada no localStorage.
export const supabase = isDemoMode
  ? createDemoClient()
  : createClient(url ?? "", anonKey ?? "", {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });

export type Role = "admin" | "member";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  active: boolean;
  created_at: string;
};
