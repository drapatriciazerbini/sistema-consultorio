// Horario extra numa data so (porte de 17/11/2026 do sistema do Dr. Marcello,
// onde entrou em 08/11). Toda semana vira availability_rules, como sempre. Uma
// vez so vira schedule_exceptions com is_closed falso: o banco ja somava esse
// tipo aos horarios livres (available_slots), mas a tela nunca deixava criar.
//
// Aqui o motivo foi outro: a Dra. Patricia saiu de ferias e liberou sete
// horarios soltos para a volta (14 a 18/12/2026). A agenda dela e por pedido e
// nao tem periodo semanal nenhum; sem o extra, o unico jeito de o robo dizer
// "tem dia 14 as 9h" seria cadastrar uma segunda-feira inteira e apagar depois.
// O robo oferece esses horarios no pedido (periodosDaUnidade, em
// atendimento.ts), e a Dra. continua confirmando cada um.

export interface ExcecaoDaAgenda {
  id: string
  unitId: string | null
  date: string
  isClosed: boolean
  startsAt: string | null
  endsAt: string | null
  reason: string
}

/**
 * Separa as excecoes em bloqueios (dia fechado) e horarios extras da unidade.
 * Antes dos extras existirem na tela, toda excecao era bloqueio; mostrar um
 * extra na lista de "Datas bloqueadas" faria a equipe apagar um horario aberto
 * achando que liberava um dia.
 */
export function separarExcecoes<T extends ExcecaoDaAgenda>(excecoes: T[], unitId: string | null) {
  const bloqueios = excecoes.filter((e) => e.isClosed)
  const extras = excecoes
    .filter((e) => !e.isClosed && e.startsAt && e.endsAt && (e.unitId === null || e.unitId === unitId))
    .sort((a, b) => `${a.date} ${a.startsAt}`.localeCompare(`${b.date} ${b.startsAt}`))
  return { bloqueios, extras }
}

export interface NovoPeriodo {
  /** true = toda semana (regra); false = so na data escolhida (extra). */
  repete: boolean
  data: string
  inicio: string
  fim: string
}

/** O que impede gravar o periodo, ou null se pode gravar. `hoje` em AAAA-MM-DD. */
export function problemaDoPeriodo(p: NovoPeriodo, hoje: string): string | null {
  if (!p.repete && !/^\d{4}-\d{2}-\d{2}$/.test(p.data)) return 'Escolha a data do horário extra.'
  if (!/^\d{2}:\d{2}/.test(p.inicio) || !/^\d{2}:\d{2}/.test(p.fim)) return 'Preencha o início e o fim.'
  if (p.fim <= p.inicio) return 'O fim do período precisa ser depois do início.'
  if (!p.repete && p.data < hoje) return 'Essa data já passou.'
  return null
}

/**
 * A data de volta das ferias so vale enquanto nao chegou. Depois dela o aviso
 * some sozinho, do robo e da tela: ninguem precisa lembrar de apagar.
 */
export function feriasEmVigor(voltaEm: string | null | undefined, hoje: string): boolean {
  return Boolean(voltaEm && /^\d{4}-\d{2}-\d{2}$/.test(voltaEm) && voltaEm > hoje)
}
