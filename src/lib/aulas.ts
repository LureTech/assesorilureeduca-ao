/**
 * Quantas aulas um curso tem — a regra, num lugar só.
 *
 * Antes cada tela contava do seu jeito: o card lia um numero escrito a mao no
 * catalogo, a barra de progresso dividia por esse mesmo numero e a pagina do
 * curso montava a lista a partir do banco. Dai o Call Anderson mostrava "6
 * aulas" no card com quinze gravadas.
 *
 * Agora quem manda e `lesson_videos`: cada linha e uma aula. As cinco
 * primeiras todo curso ja nasce tendo (mesmo sem linha), e da sexta em diante
 * so existe o que o admin criou.
 */

/** Aulas que todo curso ja nasce tendo, com ou sem linha no banco. */
export const AULAS_FIXAS = 5;

/**
 * Numero da prova final. Fica fora da faixa das aulas de proposito: se ficasse
 * no 6, a primeira aula criada cairia em cima dela — mesmo `n`, mesma chave em
 * `lesson_progress`.
 */
export const PROVA_N = 9999;

/**
 * Total de aulas do curso a partir dos `lesson_n` gravados. Conta o que a
 * pagina do curso realmente lista: as cinco fixas mais as criadas depois. A
 * prova nao entra — ela nao e aula e ninguem a conclui.
 */
export function totalDeAulas(lessonNs: number[]) {
  const extras = lessonNs.filter((n) => n > AULAS_FIXAS && n !== PROVA_N).length;
  return AULAS_FIXAS + extras;
}
