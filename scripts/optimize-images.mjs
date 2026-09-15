/**
 * Reencoda as fotos de public/ pra aliviar o primeiro carregamento.
 *
 *   node scripts/optimize-images.mjs          # mostra o que faria
 *   node scripts/optimize-images.mjs --write  # grava por cima
 *
 * Regra: nenhum lado passa de 1600px (acima disso não muda nada na tela, só
 * pesa) e JPEG em qualidade 82 com mozjpeg. Só grava se realmente ficou menor.
 * Os PNG de ícone ficam de fora — quem cuida deles é o generate-icons.mjs.
 */
import sharp from "sharp";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASTAS = ["public", "public/assets"];
const MAX_LADO = 1600;
const QUALIDADE = 82;

const gravar = process.argv.includes("--write");
const kb = (n) => `${Math.round(n / 1024)} KB`;

let ganhoTotal = 0;

for (const pasta of PASTAS) {
  let arquivos;
  try {
    arquivos = await readdir(join(root, pasta));
  } catch {
    continue;
  }

  for (const nome of arquivos) {
    if (!/\.jpe?g$/i.test(nome)) continue;
    const caminho = join(root, pasta, nome);
    if (!(await stat(caminho)).isFile()) continue;

    // Lê pra memória antes de processar: no Windows o sharp mantém o arquivo
    // de origem aberto, e aí o writeFile por cima dele falha com UNKNOWN.
    const original = await readFile(caminho);
    const antes = original.length;
    const meta = await sharp(original).metadata();
    const maiorLado = Math.max(meta.width, meta.height);

    const otimizada = await sharp(original)
      .resize(
        maiorLado > MAX_LADO
          ? {
              width: meta.width >= meta.height ? MAX_LADO : undefined,
              height: meta.height > meta.width ? MAX_LADO : undefined,
            }
          : {},
      )
      .jpeg({ quality: QUALIDADE, mozjpeg: true, progressive: true })
      .toBuffer();

    if (otimizada.length >= antes) {
      console.log(`  =  ${relative(root, caminho)} — já está bom (${kb(antes)})`);
      continue;
    }

    const nova = await sharp(otimizada).metadata();
    const pct = Math.round((1 - otimizada.length / antes) * 100);
    console.log(
      `  ↓  ${relative(root, caminho)}  ${kb(antes)} → ${kb(otimizada.length)}  (-${pct}%)  ${meta.width}x${meta.height} → ${nova.width}x${nova.height}`,
    );
    ganhoTotal += antes - otimizada.length;
    if (gravar) await writeFile(caminho, otimizada);
  }
}

console.log(
  `\nEconomia total: ${kb(ganhoTotal)}${gravar ? " (gravado)" : " — rode com --write pra aplicar"}`,
);
