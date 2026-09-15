import { supabase } from "./supabase";

/** Categorias fixas do catálogo (mesmos ids usados na home). */
export const SECTIONS: { id: string; title: string; subtitle: string }[] = [
  { id: "intro", title: "INTRODUÇÃO", subtitle: "Comece por aqui — a base do ecossistema LURE" },
  { id: "call", title: "CALL DE VENDAS", subtitle: "Do primeiro contato ao fechamento" },
  { id: "social", title: "SOCIAL SELLING", subtitle: "Prospecção e autoridade nas redes" },
  { id: "rh", title: "RH & CULTURA", subtitle: "Time forte, cultura forte, resultado forte" },
  { id: "comercial", title: "COMERCIAL", subtitle: "Processos, funil e conversão de alto ticket" },
  { id: "marketing", title: "MARKETING", subtitle: "Estratégia, marca e posicionamento" },
  { id: "trafego", title: "GESTÃO DE TRÁFEGO", subtitle: "Meta, Google e mensuração em escala" },
  { id: "ia", title: "IA APLICADA", subtitle: "Inteligência artificial no dia a dia de marketing" },
  { id: "conteudo", title: "CONTEÚDO & CRIATIVOS", subtitle: "Narrativa, roteiro e produção que converte" },
];

export function sectionTitle(id: string): string {
  return SECTIONS.find((s) => s.id === id)?.title ?? id;
}

export type ModuleRow = {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  author: string | null;
  youtube_url: string | null;
  cover_url: string | null;
  sort_order: number;
  created_at: string;
};

/** Sobe a capa do módulo pro bucket `covers` e devolve a URL pública. */
export async function uploadCover(file: File, moduleKey: string): Promise<string> {
  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${moduleKey}/cover-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("covers").upload(path, file, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("covers").getPublicUrl(path);
  return data.publicUrl;
}

/** Sobe um material de aula pro bucket `materials` e devolve a URL pública. */
export async function uploadMaterial(
  file: File,
  courseSlug: string,
  lessonN: number,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${courseSlug}/${lessonN}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("materials").upload(path, file, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("materials").getPublicUrl(path);
  return data.publicUrl;
}

/** Limite de material: 50 MB. */
export function validateMaterialFile(file: File): string | null {
  if (file.size > 50 * 1024 * 1024) return "O arquivo precisa ter no máximo 50 MB.";
  return null;
}

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Escolha um arquivo de imagem (JPG, PNG…).";
  if (file.size > 10 * 1024 * 1024) return "A imagem precisa ter no máximo 10 MB.";
  return null;
}
