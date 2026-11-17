import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Ferias: o dia em que o atendimento volta (17/11/2026).
 *
 * A Dra. Patricia saiu de ferias e o Edu pediu: "se alguem quiser alguma data
 * antes, e para falar que ela ta de ferias. E o atendimento sera reiniciado a
 * partir do dia 14 de dezembro". A data mora em clinic_settings.ferias_volta_em
 * e vale enquanto nao chegou (ver feriasEmVigor em agenda-extra.ts): o robo e o
 * atendente com IA avisam e nao oferecem nada antes dela.
 *
 * Coluna nova, fora dos tipos gerados e lida em consulta separada: sem a
 * migration, a Agenda abre igual e o campo avisa que o banco ainda nao tem a
 * coluna, em vez de quebrar a tela de configuracao.
 */
const semTipo = supabase as unknown as SupabaseClient

/** A data de volta (AAAA-MM-DD, ou vazio). null = banco sem a coluna. */
export async function getFeriasVoltaEm(clinicId: string): Promise<string | null> {
  try {
    const { data, error } = await semTipo.from('clinic_settings').select('ferias_volta_em').eq('clinic_id', clinicId).maybeSingle()
    if (error) throw error
    return String((data as { ferias_volta_em?: string | null } | null)?.ferias_volta_em ?? '').slice(0, 10)
  } catch (erro) {
    console.warn('Sem clinic_settings.ferias_volta_em', erro)
    return null
  }
}

export async function saveFeriasVoltaEm(clinicId: string, voltaEm: string) {
  const { data, error } = await semTipo
    .from('clinic_settings')
    .update({ ferias_volta_em: voltaEm || null })
    .eq('clinic_id', clinicId)
    .select('clinic_id')
  if (error) throw new Error(`As férias não foram salvas (${error.message})`)
  // A RLS recusa sem erro: o update volta vazio. Calado, a tela mostraria a
  // data e o robo seguiria sem avisar ninguem.
  if (!data?.length) throw new Error('As férias não foram salvas: só o administrador da clínica pode mudar isto.')
}
