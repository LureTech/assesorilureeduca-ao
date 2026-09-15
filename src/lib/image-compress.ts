/**
 * Compressão de imagem no próprio navegador, antes de subir.
 *
 * A ideia é o aluno poder mandar a foto direto da galeria (que hoje sai com 4, 8,
 * 12 MB) sem entupir o storage nem o feed: a gente redimensiona, reencoda em
 * WebP e vai baixando a qualidade até caber no orçamento de bytes. Como é o
 * canvas que reescreve o arquivo, os metadados EXIF (inclusive localização)
 * ficam pelo caminho — e a rotação da foto é aplicada de verdade nos pixels.
 */

/** Maior lado da imagem final. 1600px cobre tela de retina sem exagero. */
const MAX_SIDE = 1600;
/** Alvo de tamanho do arquivo final. O bucket aceita até 1 MB. */
const BUDGET_BYTES = 400 * 1024;
/** Acima disso nem tenta decodificar — provavelmente não é foto de post. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** Abaixo dessa qualidade a imagem começa a ficar feia; melhor encolher. */
const MIN_QUALITY = 0.55;

export type CompressedImage = {
  file: File;
  width: number;
  height: number;
  bytes: number;
  /** Tamanho original, pra poder mostrar "de 6,2 MB pra 280 KB". */
  originalBytes: number;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Valida antes de gastar memória decodificando. Devolve o erro ou null. */
export function validatePostImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Escolha um arquivo de imagem (JPG, PNG, WebP…).";
  if (file.type === "image/gif") return "GIF não rola por aqui — mande uma imagem estática.";
  if (file.size > MAX_INPUT_BYTES) {
    return `Essa imagem tem ${formatBytes(file.size)}. O limite é ${formatBytes(MAX_INPUT_BYTES)}.`;
  }
  return null;
}

function canvasFor(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

async function toBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))),
      type,
      quality,
    ),
  );
}

/** O Safari só ganhou WebP no 14; se não rolar, cai pra JPEG. */
async function pickFormat(): Promise<"image/webp" | "image/jpeg"> {
  try {
    const probe = canvasFor(1, 1);
    const blob = await toBlob(probe, "image/webp", 0.8);
    return blob.type === "image/webp" ? "image/webp" : "image/jpeg";
  } catch {
    return "image/jpeg";
  }
}

function drawScaled(bitmap: ImageBitmap, scale: number) {
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = canvasFor(width, height);
  const ctx = canvas.getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Este navegador não conseguiu processar a imagem.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Fundo branco: PNG com transparência viraria preto no JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, width, height };
}

/**
 * Redimensiona e reencoda até caber no orçamento. Primeiro tenta baixar só a
 * qualidade; se nem no mínimo couber, encolhe as dimensões e repete.
 */
export async function compressPostImage(file: File): Promise<CompressedImage> {
  const problema = validatePostImage(file);
  if (problema) throw new Error(problema);

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const type = await pickFormat();

  try {
    // Escala inicial: nunca aumenta uma imagem pequena.
    let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    let melhor: { blob: Blob; width: number; height: number } | null = null;

    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const { canvas, width, height } = drawScaled(bitmap, scale);

      let alta = 0.92;
      let baixa = MIN_QUALITY;
      let escolhido: Blob | null = null;

      // Busca binária na qualidade: 5 passos chegam bem perto do orçamento.
      for (let passo = 0; passo < 5; passo++) {
        const q = (alta + baixa) / 2;
        const blob = await toBlob(canvas, type, q);
        if (blob.size <= BUDGET_BYTES) {
          escolhido = blob; // coube: tenta subir a qualidade
          baixa = q;
        } else {
          alta = q; // estourou: precisa baixar
        }
        if (alta - baixa < 0.04) break;
      }

      if (escolhido) {
        melhor = { blob: escolhido, width, height };
        break;
      }

      // Nem no mínimo coube: guarda o menor que conseguimos e encolhe mais.
      const minimo = await toBlob(canvas, type, MIN_QUALITY);
      melhor = { blob: minimo, width, height };
      if (minimo.size <= BUDGET_BYTES) break;
      scale *= 0.75;
    }

    if (!melhor) throw new Error("Não foi possível preparar essa imagem.");

    const ext = type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "imagem";
    return {
      file: new File([melhor.blob], `${base}.${ext}`, { type }),
      width: melhor.width,
      height: melhor.height,
      bytes: melhor.blob.size,
      originalBytes: file.size,
    };
  } finally {
    bitmap.close();
  }
}
