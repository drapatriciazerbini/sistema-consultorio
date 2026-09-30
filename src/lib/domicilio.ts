import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Visita em casa na Agenda (30/09/2026).
 *
 * Pedido da Dra. Patricia: "se marcar um domicilio na quarta de manha, acabou a
 * manha". A visita e marcada com a duracao que precisar - 1h, 2h, 3h, a manha
 * ou a tarde inteira - e ocupa a agenda dela em TODAS as unidades, com margem
 * de deslocamento (ver a migration domicilio_ocupa_a_agenda). O consultorio
 * mostra o bloco, e o robo deixa de oferecer o que ficou ocupado.
 *
 * Cliente sem tipo: is_home_visit e mais nova que os tipos gerados.
 */
const db = supabase as unknown as SupabaseClient

export type DuracaoDoDomicilio = '60' | '90' | '120' | '180' | 'manha' | 'tarde'

export const DURACOES_DO_DOMICILIO: { valor: DuracaoDoDomicilio; rotulo: string }[] = [
  { valor: '60', rotulo: '1 hora' },
  { valor: '90', rotulo: '1h30' },
  { valor: '120', rotulo: '2 horas' },
  { valor: '180', rotulo: '3 horas' },
  { valor: 'manha', rotulo: 'Manhã inteira (8h às 12h)' },
  { valor: 'tarde', rotulo: 'Tarde inteira (13h às 18h)' },
]

/**
 * Inicio e fim da visita, em horario de Sao Paulo (sem horario de verao desde
 * 2019). Manha e tarde ignoram a hora digitada: sao o turno inteiro.
 */
export function janelaDoDomicilio(
  data: string,
  inicio: string,
  duracao: DuracaoDoDomicilio,
): { inicio: string; fim: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const local = (hhmm: string) => new Date(`${data}T${hhmm}:00-03:00`)
  if (duracao === 'manha') return { inicio: local('08:00').toISOString(), fim: local('12:00').toISOString() }
  if (duracao === 'tarde') return { inicio: local('13:00').toISOString(), fim: local('18:00').toISOString() }
  if (!/^\d{2}:\d{2}$/.test(inicio)) return null
  const comeco = local(inicio)
  if (Number.isNaN(comeco.getTime())) return null
  const fim = new Date(comeco.getTime() + Number(duracao) * 60_000)
  return { inicio: comeco.toISOString(), fim: fim.toISOString() }
}

/** Dois intervalos se cruzam, com margem em volta do segundo. */
export function seCruzam(
  a: { inicio: string; fim: string },
  b: { inicio: string; fim: string },
  margemMinutos = 0,
): boolean {
  const margem = margemMinutos * 60_000
  return (
    new Date(a.inicio).getTime() < new Date(b.fim).getTime() + margem &&
    new Date(a.fim).getTime() > new Date(b.inicio).getTime() - margem
  )
}

/** Ids das unidades de visita em casa. Vazio se a coluna ainda nao existe. */
export async function unidadesDeVisita(clinicId: string): Promise<Set<string>> {
  try {
    const { data, error } = await db
      .from('clinic_units')
      .select('id,is_home_visit')
      .eq('clinic_id', clinicId)
      .is('archived_at', null)
    if (error || !data) return new Set()
    return new Set(
      (data as { id: string; is_home_visit: boolean | null }[]).filter((u) => u.is_home_visit).map((u) => u.id),
    )
  } catch {
    return new Set()
  }
}

/** Margem de deslocamento em volta da visita. 30 min se a coluna nao existe. */
export async function margemDoDomicilio(clinicId: string): Promise<number> {
  try {
    const { data, error } = await db
      .from('clinic_settings')
      .select('domicilio_margem_minutos')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (error) return 30
    const valor = (data as { domicilio_margem_minutos?: number | null } | null)?.domicilio_margem_minutos
    return typeof valor === 'number' ? valor : 30
  } catch {
    return 30
  }
}

export type ConsultaQueCruza = { id: string; inicio: string; fim: string; nome: string }

/**
 * Consultas de qualquer unidade que caem na janela da visita (com a margem).
 * A tela mostra a lista antes de marcar: marcar por cima nao cancela ninguem.
 */
export async function consultasNaJanela(
  clinicId: string,
  janela: { inicio: string; fim: string },
  margemMinutos: number,
): Promise<ConsultaQueCruza[]> {
  const margem = margemMinutos * 60_000
  const de = new Date(new Date(janela.inicio).getTime() - margem).toISOString()
  const ate = new Date(new Date(janela.fim).getTime() + margem).toISOString()
  const { data, error } = await db
    .from('appointments')
    .select('id,starts_at,ends_at,contact_name,staff_note,patient_id')
    .eq('clinic_id', clinicId)
    .neq('status', 'cancelled')
    .lt('starts_at', ate)
    .gt('ends_at', de)
    .order('starts_at')
  if (error) throw new Error(error.message)
  const linhas = (data ?? []) as {
    id: string
    starts_at: string
    ends_at: string
    contact_name: string | null
    staff_note: string | null
    patient_id: string | null
  }[]
  const ids = [...new Set(linhas.map((l) => l.patient_id).filter(Boolean))] as string[]
  const { data: pacientes } = ids.length
    ? await db.from('patients').select('id,name').in('id', ids)
    : { data: [] as { id: string; name: string }[] }
  const nomes = new Map(((pacientes ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))
  return linhas.map((c) => ({
    id: c.id,
    inicio: c.starts_at,
    fim: c.ends_at,
    nome: (c.patient_id && nomes.get(c.patient_id)) || c.contact_name || c.staff_note || 'Reservado',
  }))
}

export async function marcarDomicilio(opcoes: {
  clinicId: string
  unitId: string
  patientId: string | null
  janela: { inicio: string; fim: string }
  endereco: string
  contato: { nome: string; telefone: string }
}) {
  const endereco = opcoes.endereco.trim()
  const { error } = await db.from('appointments').insert({
    clinic_id: opcoes.clinicId,
    unit_id: opcoes.unitId,
    patient_id: opcoes.patientId,
    starts_at: opcoes.janela.inicio,
    ends_at: opcoes.janela.fim,
    source: 'clinic',
    staff_note: endereco ? `🏠 ${endereco}` : '🏠 Visita em casa',
    contact_name: opcoes.contato.nome.trim(),
    contact_phone: opcoes.contato.telefone.replace(/\D/g, ''),
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Já existe uma visita marcada neste mesmo horário. Atualize a agenda.')
    }
    throw new Error(error.message)
  }
}
