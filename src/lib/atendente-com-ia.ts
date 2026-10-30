import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * O liga/desliga e o texto do atendente com IA (28/10/2026). Ver
 * supabase/functions/_shared/assistente.ts.
 *
 * Colunas novas, ainda fora dos tipos gerados, e lidas em consulta separada:
 * sem a migration 20261028110000, a leitura volta nula e o cartao diz que a
 * atualizacao do banco ainda nao chegou, em vez de quebrar Preferencias.
 */
const semTipo = supabase as unknown as SupabaseClient

export type ModoDoAtendenteIA = 'desligado' | 'sombra' | 'ligado'

/** O modo desta clinica. null = banco sem a coluna. */
export async function getAtendenteIA(clinicId: string): Promise<ModoDoAtendenteIA | null> {
  try {
    const { data, error } = await semTipo.from('clinic_settings').select('assistente_ia').eq('clinic_id', clinicId).maybeSingle()
    if (error) throw error
    const valor = (data as { assistente_ia?: string } | null)?.assistente_ia
    return valor === 'sombra' || valor === 'ligado' ? valor : 'desligado'
  } catch (erro) {
    console.warn('Sem clinic_settings.assistente_ia', erro)
    return null
  }
}

export async function saveAtendenteIA(clinicId: string, modo: ModoDoAtendenteIA) {
  const { data, error } = await semTipo
    .from('clinic_settings')
    .update({ assistente_ia: modo })
    .eq('clinic_id', clinicId)
    .select('clinic_id')
  if (error) throw new Error(`O modo não foi salvo (${error.message})`)
  // A RLS recusa sem erro: o update volta vazio. Calado, a tela diria "ligado"
  // com o banco ainda desligado.
  if (!data?.length) throw new Error('O modo não foi salvo: só o administrador da clínica pode mudar isto.')
}

/** O texto livre que a IA usa. null = banco sem a coluna. */
export async function getConhecimentoIA(clinicId: string): Promise<string | null> {
  try {
    const { data, error } = await semTipo
      .from('clinic_settings')
      .select('assistente_ia_conhecimento')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (error) throw error
    return (data as { assistente_ia_conhecimento?: string | null } | null)?.assistente_ia_conhecimento ?? ''
  } catch (erro) {
    console.warn('Sem clinic_settings.assistente_ia_conhecimento', erro)
    return null
  }
}

export async function saveConhecimentoIA(clinicId: string, texto: string) {
  const { data, error } = await semTipo
    .from('clinic_settings')
    .update({ assistente_ia_conhecimento: texto.trim() })
    .eq('clinic_id', clinicId)
    .select('clinic_id')
  if (error) throw new Error(`O texto não foi salvo (${error.message})`)
  if (!data?.length) throw new Error('O texto não foi salvo: só o administrador da clínica pode mudar isto.')
}

export type UsoDaIA = { respostas: number; falhas: number; ultimaFalha: { quando: string; detalhe: string } | null }

/**
 * O que a IA fez nos ultimos 7 dias, pelos eventos do robo (ia_respondeu,
 * ia_falhou). Falha que so existe no log e falha calada: o lembrete da vespera
 * ficou tres semanas parado assim. Aqui ela aparece no cartao, com o motivo.
 */
export async function getUsoDaIA(clinicId: string, agora = new Date()): Promise<UsoDaIA | null> {
  try {
    const desde = new Date(agora.getTime() - 7 * 86_400_000).toISOString()
    const { data, error } = await semTipo
      .from('whatsapp_bot_events')
      .select('evento,detalhe,criado_em')
      .eq('clinic_id', clinicId)
      .in('evento', ['ia_respondeu', 'ia_falhou'])
      .gte('criado_em', desde)
      .order('criado_em', { ascending: false })
      .limit(1000)
    if (error) throw error
    const linhas = (data ?? []) as { evento: string; detalhe: string | null; criado_em: string }[]
    const falhas = linhas.filter((l) => l.evento === 'ia_falhou')
    return {
      respostas: linhas.filter((l) => l.evento === 'ia_respondeu').length,
      falhas: falhas.length,
      ultimaFalha: falhas[0] ? { quando: falhas[0].criado_em, detalhe: falhas[0].detalhe ?? '' } : null,
    }
  } catch (erro) {
    console.warn('Nao li o uso da IA', erro)
    return null
  }
}
