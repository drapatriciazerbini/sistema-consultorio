/**
 * O nome do contato como o paciente e a familia podem ler (porte de 20/11/2026
 * do sistema do Dr. Marcello, onde entrou em 17/11).
 *
 * O nome da consulta sem cadastro e um campo livre da agenda, e a equipe
 * escreve recados nele: "Ana Zamur - AGENDA FECHADA POR TEMPO INDETERMINADO",
 * "Vicente Rodrigues de Paula (T)". La, em 17/11, 11h44, o robo respondeu "Sua
 * consulta: Ana Zamur - AGENDA FECHADA POR TEMPO INDETERMINADO" para a propria
 * familia. O recado e da equipe; para fora vai so o nome.
 *
 * Aqui vale tambem para o lembrete, a repeticao do lembrete e o aviso de
 * cancelamento, que usam o mesmo campo (la so a resposta do robo usava).
 *
 * Corta o que vem entre parenteses ou colchetes e tudo depois de um separador
 * solto (" - ", " | ", " / ", ":", "*"). Hifen colado ("Ana-Maria") e nome.
 */
export function nomeParaAFamilia(nome: string | null | undefined): string {
  const bruto = String(nome ?? '').trim()
  // Recado sem nome nenhum na frente ("- ligar antes"): melhor nada do que o recado.
  if (/^[-–—|/:*]/.test(bruto)) return ''
  const limpo = bruto
    .replace(/[([{][^)\]}]*[)\]}]?/g, ' ')
    .split(/\s[-–—|/]+\s|[:*]/)[0]
    .replace(/\s+/g, ' ')
    .trim()
  return /\p{L}/u.test(limpo) ? limpo : ''
}
