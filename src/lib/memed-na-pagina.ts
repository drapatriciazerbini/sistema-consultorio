/**
 * Como reconhecer a Memed na pagina (03/11/2026).
 *
 * Neste dia a Memed trocou, sem aviso, o que o mesmo script de sempre carrega:
 * agora ele sobe a "sinapse-v4", com uma camada de compatibilidade para quem
 * integrou do jeito antigo. Os comandos (setPaciente, show, hide) e o evento
 * core:moduleHide continuam iguais - conferido no navegador do consultorio. O
 * que mudou foi o quadro: em vez de um iframe por modulo, com id
 * mdhub-module-plataforma.prescricao, vem um iframe so, sem id, de
 * v4-embedded.memed.com.br, dentro de uma div #memed-auto-generated que fica
 * com visibility hidden quando fechada.
 *
 * O carregamento esperava o id antigo para dizer "pronto". Como ele nao vinha
 * mais, o prazo de 40 s estourava e o botao Prescrever mostrava "A Memed nao
 * respondeu a tempo" com a Memed carregada e pronta atras. Aceitar os dois
 * jeitos, e nao so o novo, porque a Memed pode voltar atras ou mudar de novo
 * por conta - foi o que acabou de acontecer.
 *
 * Regra pura, sem DOM: memed.ts passa o que achou e o teste
 * (tests/memed-na-pagina.test.mjs) confere os dois formatos.
 */

/** O iframe do modulo de prescricao no formato antigo, criado pelo MdHub. */
export const QUADRO_ANTIGO = 'mdhub-module-plataforma.prescricao'

/** De onde vem o iframe unico da Memed nova. */
export const DOMINIO_V4 = 'v4-embedded.memed.com.br'

/** O id da div em volta do iframe da Memed nova. */
export const CAIXA_V4 = 'memed-auto-generated'

export type QuadroNaPagina = { id: string; src: string }

/** A prescricao ja esta na pagina e aceita comando? */
export function prescricaoCarregada(quadros: QuadroNaPagina[]): boolean {
  return quadros.some((q) => q.id === QUADRO_ANTIGO || dominio(q.src) === DOMINIO_V4)
}

function dominio(endereco: string): string {
  try {
    return new URL(endereco).hostname
  } catch {
    return ''
  }
}

/**
 * Alguma tela da Memed esta aberta na frente da pagina?
 *
 * antigos: o display de cada iframe mdhub-module-*. v4: a visibility da div
 * #memed-auto-generated, ou null quando ela nao existe.
 */
export function memedAberta(antigos: string[], v4: string | null): boolean {
  return antigos.some((display) => display !== 'none') || (v4 !== null && v4 !== 'hidden')
}
