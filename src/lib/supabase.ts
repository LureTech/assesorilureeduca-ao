import { createClient } from "@supabase/supabase-js";
import { createDemoClient } from "./supabase-demo";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Sem as variáveis do Supabase o app roda em modo demo: login livre e dados
 * guardados só no navegador (ver supabase-demo.ts). Preencher o .env e
 * reiniciar o `npm run dev` volta pro banco de verdade.
 *
 * Só vale no `npm run dev`: um deploy sem as variáveis não pode virar um site
 * onde qualquer senha entra como admin.
 */
export const isDemoMode = import.meta.env.DEV && (!url || !anonKey);

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
