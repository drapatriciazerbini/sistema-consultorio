/**
 * As cidades dos pacientes, somadas e postas no mapa (18/11/2026, porte do
 * sistema de origem, onde entrou em 13/11/2026).
 *
 * Duas coisas num arquivo so, porque uma depende da outra:
 *
 * 1. Somar as grafias. A cidade e digitada a mao em cada cadastro, e o painel
 *    contava "Santos" e "SANTOS" como duas cidades: a caixa alta da tela
 *    deixava as duas barras iguais aos olhos, mas a conta as separava. Na
 *    origem apareceu "SANTOS 4" e "SANTOS 4" lado a lado. Aqui o risco e o
 *    mesmo, com Santos e Sao Vicente respondendo por quase toda a base. Acento,
 *    espaco e o "/SP" do fim tambem contam como a mesma cidade.
 *
 * 2. Dizer onde cada uma fica. O mapa desenhado e um esquema da Baixada
 *    Santista com Sao Paulo no planalto, sem biblioteca e sem internet, entao
 *    so conhece as cidades desta lista. Quem mora fora dela NAO some: entra em
 *    `fora`, que a tela mostra como "Outras cidades", e continua no ranking.
 */

export type Ancora = 'start' | 'middle' | 'end'

export type CidadeNoMapa = {
  chave: string
  nome: string
  n: number
  lon: number
  lat: number
  /** Onde o nome fica em relacao ao pe da coluna: [dx, dy, alinhamento]. */
  rotulo: readonly [number, number, Ancora]
}

/** [nome de exibicao, longitude, latitude, rotulo]. */
const CONHECIDAS: readonly (readonly [string, number, number, readonly [number, number, Ancora]])[] = [
  ['Santos', -46.325, -23.955, [0, 20, 'middle']],
  ['São Vicente', -46.39, -23.965, [-34, 4, 'end']],
  ['Praia Grande', -46.44, -24.01, [-12, 18, 'end']],
  ['Guarujá', -46.255, -23.99, [13, 8, 'start']],
  ['Cubatão', -46.42, -23.89, [-22, -12, 'end']],
  ['Bertioga', -46.14, -23.85, [12, 6, 'start']],
  ['Mongaguá', -46.62, -24.09, [0, 19, 'middle']],
  ['Itanhaém', -46.79, -24.18, [0, 19, 'middle']],
  ['Peruíbe', -47.0, -24.32, [12, -3, 'start']],
  ['São Paulo', -46.63, -23.55, [13, 4, 'start']],
  ['São Bernardo do Campo', -46.55, -23.7, [13, 4, 'start']],
  ['Santo André', -46.53, -23.66, [13, 4, 'start']],
  ['São Caetano do Sul', -46.57, -23.62, [13, 4, 'start']],
  ['Diadema', -46.62, -23.69, [-13, 4, 'end']],
  ['Osasco', -46.79, -23.53, [-13, 4, 'end']],
]

/**
 * A mesma cidade, escrita de qualquer jeito, da a mesma chave: sem acento, em
 * minuscula, com um espaco so e sem o estado no fim ("Santos/SP", "Santos - SP").
 */
export function chaveDaCidade(nome: string): string {
  return String(nome ?? '')
    .normalize('NFD')
    // Os acentos soltos pelo NFD. Escrito por codigo, e nao com o caractere,
    // porque o arquivo circula por ferramentas que estropiam acento.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*[-/,(]\s*sp\s*\)?\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const porChave = new Map(CONHECIDAS.map((c) => [chaveDaCidade(c[0]), c] as const))

export type CidadesDosPacientes = {
  /** Todas as cidades, somadas, da maior para a menor (empate: ordem alfabetica). */
  ranking: [string, number][]
  /** So as que o mapa sabe desenhar. */
  noMapa: CidadeNoMapa[]
  /** Pacientes com cidade preenchida que o mapa nao sabe onde fica. */
  fora: number
}

export function cidadesDosPacientes(nomes: readonly (string | null | undefined)[]): CidadesDosPacientes {
  const soma = new Map<string, { nome: string; n: number }>()
  for (const bruto of nomes) {
    const chave = chaveDaCidade(bruto ?? '')
    if (!chave) continue
    const ja = soma.get(chave)
    if (ja) ja.n++
    // Cidade conhecida aparece com o nome certo; a desconhecida, como foi
    // digitada da primeira vez (a tela poe em caixa alta de qualquer forma).
    else soma.set(chave, { nome: porChave.get(chave)?.[0] ?? String(bruto).trim().replace(/\s+/g, ' '), n: 1 })
  }
  const todas = [...soma.entries()].sort((a, b) => b[1].n - a[1].n || a[1].nome.localeCompare(b[1].nome, 'pt-BR'))
  const noMapa: CidadeNoMapa[] = []
  let fora = 0
  for (const [chave, { nome, n }] of todas) {
    const conhecida = porChave.get(chave)
    if (conhecida) noMapa.push({ chave, nome, n, lon: conhecida[1], lat: conhecida[2], rotulo: conhecida[3] })
    else fora += n
  }
  return { ranking: todas.map(([, c]) => [c.nome, c.n]), noMapa, fora }
}
