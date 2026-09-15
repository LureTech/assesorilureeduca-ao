/**
 * Gera os ícones do PWA a partir de uma única arte-fonte.
 *
 *   node scripts/generate-icons.mjs
 *
 * Fonte: src/assets/app-icon-source.png (quadrada, fundo próprio, cantos arredondados
 * e sobra transparente em volta). Trocou a logo? Substitua esse arquivo e rode de novo.
 *
 * Saídas em public/:
 *   pwa-icon-192.png / pwa-icon-512.png  → purpose "any" (mantêm os cantos da arte)
 *   pwa-icon-maskable-512.png            → purpose "maskable" (sangra até a borda;
 *                                           o Android é quem recorta o formato)
 *   apple-touch-icon.png                 → 180px sem transparência (o iOS arredonda)
 *   favicon-32.png / favicon.ico         → aba do navegador
 *   notification-badge-96.png            → silhueta branca da barra de status do Android
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "src/assets/app-icon-source.png");
const OUT = join(root, "public");

/** Recorta a sobra transparente e devolve só o quadrado da arte. */
async function trimmed() {
  const img = sharp(SOURCE).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];

  let minX = info.width,
    minY = info.height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (alphaAt(x, y) > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const size = Math.min(maxX - minX + 1, maxY - minY + 1);
  return sharp(SOURCE)
    .extract({ left: minX, top: minY, width: size, height: size })
    .png()
    .toBuffer();
}

/**
 * Versão que sangra até a borda, sem transparência e sem os cantos arredondados
 * da arte — quem arredonda é o sistema.
 *
 * Como a nuvem e o fundo em degradê são uma imagem só (não dá pra separar as
 * camadas), o fundo é a própria arte desfocada ocupando o quadro inteiro, e a
 * arte nítida entra por cima com a borda suavizada. O degradê continua até a
 * borda e a emenda não aparece.
 *
 * `zoom` é o tamanho da arte dentro do quadro. A nuvem ocupa ~75% da arte, e no
 * ícone maskable o conteúdo precisa caber no círculo central de 80% — por isso
 * o padrão de 0.85 (nuvem fica em ~64% do quadro).
 */
async function fullBleed(square, size, zoom = 0.85) {
  const work = 1024; // monta grande e reduz no fim, pra não perder nitidez

  // O fundo é o mesmo degradê da arte (azul no canto superior esquerdo indo pra
  // quase preto no inferior direito), refeito ocupando o quadro inteiro. Como as
  // cores batem com as bordas da arte, a emenda do quadrado arredondado some.
  const backdrop = Buffer.from(
    `<svg width="${work}" height="${work}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#0356FF"/>
           <stop offset="0.55" stop-color="#04122F"/>
           <stop offset="1" stop-color="#01040F"/>
         </linearGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#g)"/>
     </svg>`,
  );

  const artSize = Math.round(work * zoom);
  const art = await sharp(square).resize(artSize, artSize).png().toBuffer();
  const offset = Math.round((work - artSize) / 2);

  // Compõe e só depois reduz: no sharp o resize acontece antes do composite
  // quando estão no mesmo pipeline.
  const composed = await sharp(backdrop)
    .composite([{ input: art, left: offset, top: offset }])
    .png()
    .toBuffer();

  return sharp(composed)
    .resize(size, size)
    .flatten({ background: "#01040f" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Silhueta branca em fundo transparente para o `badge` da notificação — o
 * Android joga fora a cor e usa só o formato na barra de status. A nuvem e o
 * foguete têm o verde bem mais alto que o degradê do fundo, então é ele que
 * separa a marca do fundo.
 */
async function badge(square, size) {
  const { data, info } = await sharp(square)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const g = data[i * 4 + 1];
    const a = Math.max(0, Math.min(1, (g - 95) / 55)); // 95 = fundo, 150 = marca
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = Math.round(a * 255 * (data[i * 4 + 3] / 255));
  }
  return sharp(out, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Empacota PNGs num .ico. Um `.ico` é só um índice + as imagens coladas em
 * seguida, e navegador aceita PNG lá dentro. Precisa existir porque tem gente
 * (e robô) que busca /favicon.ico direto, ignorando as tags do <head>.
 */
async function ico(square, sizes) {
  const imagens = await Promise.all(
    sizes.map((s) => sharp(square).resize(s, s).png({ compressionLevel: 9 }).toBuffer()),
  );

  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // 1 = ícone
  cabecalho.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const indice = sizes.map((s, i) => {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(s >= 256 ? 0 : s, 0); // 0 quer dizer 256
    entrada.writeUInt8(s >= 256 ? 0 : s, 1);
    entrada.writeUInt8(0, 2); // paleta
    entrada.writeUInt8(0, 3); // reservado
    entrada.writeUInt16LE(1, 4); // planos
    entrada.writeUInt16LE(32, 6); // bits por pixel
    entrada.writeUInt32LE(imagens[i].length, 8);
    entrada.writeUInt32LE(offset, 12);
    offset += imagens[i].length;
    return entrada;
  });

  return Buffer.concat([cabecalho, ...indice, ...imagens]);
}

const square = await trimmed();
await mkdir(OUT, { recursive: true });

const write = (name, buf) =>
  sharp(buf)
    .toFile(join(OUT, name))
    .then(() => console.log("✓", name));
const writeRaw = (name, buf) => writeFile(join(OUT, name), buf).then(() => console.log("✓", name));

await Promise.all([
  // "any": mantém os cantos arredondados da própria arte.
  sharp(square)
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toBuffer()
    .then((b) => write("pwa-icon-512.png", b)),
  sharp(square)
    .resize(192, 192)
    .png({ compressionLevel: 9 })
    .toBuffer()
    .then((b) => write("pwa-icon-192.png", b)),
  sharp(square)
    .resize(32, 32)
    .png({ compressionLevel: 9 })
    .toBuffer()
    .then((b) => write("favicon-32.png", b)),
  // "maskable" e iOS: sangram até a borda, sem transparência.
  fullBleed(square, 512).then((b) => write("pwa-icon-maskable-512.png", b)),
  // O iOS recorta bem menos que o Android, então a arte pode respirar um pouco mais.
  fullBleed(square, 180, 0.97).then((b) => write("apple-touch-icon.png", b)),
  badge(square, 96).then((b) => write("notification-badge-96.png", b)),
  ico(square, [16, 32, 48]).then((b) => writeRaw("favicon.ico", b)),
]);

console.log("Ícones gerados em public/");
