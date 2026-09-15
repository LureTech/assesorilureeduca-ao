import { useState } from "react";
import { supabase } from "@/lib/supabase";

/** Iniciais a partir do nome (ou e-mail como fallback). */
export function initialsOf(name?: string | null, email?: string | null) {
  const base = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2);
  return chars.toUpperCase();
}

/**
 * Foto de perfil. Mostra a imagem quando existe `url`; caso contrário,
 * o círculo dourado com as iniciais. Se a imagem falhar ao carregar,
 * cai de volta pras iniciais automaticamente.
 */
export function Avatar({
  url,
  name,
  email,
  className = "",
  textClassName = "text-xs",
}: {
  url?: string | null;
  name?: string | null;
  email?: string | null;
  /** Aplique tamanho aqui (ex.: "h-10 w-10"). */
  className?: string;
  textClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImg = !!url && !broken;

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full gradient-gold font-bold text-primary-foreground ${className}`}
    >
      {showImg ? (
        <img
          src={url as string}
          alt={name || email || "Perfil"}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={textClassName}>{initialsOf(name, email)}</span>
      )}
    </span>
  );
}

/**
 * Envia um arquivo de imagem pro bucket `avatars`, na pasta do usuário,
 * e devolve a URL pública (com cache-buster) pra salvar em profiles.avatar_url.
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

/** Valida o arquivo escolhido. Retorna mensagem de erro ou null. */
export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Escolha um arquivo de imagem (JPG, PNG…).";
  if (file.size > 5 * 1024 * 1024) return "A imagem precisa ter no máximo 5 MB.";
  return null;
}
