/** Extrai o ID de um vídeo a partir de qualquer formato de link do YouTube. */
export function parseYouTubeId(input: string): string | null {
  const url = input.trim();
  if (!url) return null;

  // Só o ID puro (11 caracteres)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?[^ ]*v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Monta a URL de embed a partir de um link do YouTube. Retorna null se inválido. */
export function toYouTubeEmbed(input: string): string | null {
  const id = parseYouTubeId(input);
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : null;
}
