import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { paraEnvio } from '../../supabase/functions/_shared/telefone-br.ts'

/**
 * Os celulares do aviso de pedido no WhatsApp da Dra. Patricia (28/10/2026).
 * Ver supabase/functions/_shared/alerta-de-urgencia.ts.
 *
 * Coluna e tabela novas, ainda fora dos tipos gerados, e lidas em consulta
 * separada: sem a migration 20261028100000, a leitura volta nula e o cartao
 * diz que a atualizacao do banco ainda nao chegou, em vez de quebrar a tela de
 * Preferencias inteira.
 */
const semTipo = supabase as unknown as SupabaseClient

/** null = banco sem a coluna; lista vazia = aviso desligado. */
export async function getNumerosDoAviso(clinicId: string): Promise<string[] | null> {
  try {
    const { data, error } = await semTipo
      .from('clinic_settings')
      .select('alerta_urgencia_telefones')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (error) throw error
    const lista = (data as { alerta_urgencia_telefones?: unknown } | null)?.alerta_urgencia_telefones
    return Array.isArray(lista) ? lista.map(String) : []
  } catch (erro) {
    console.warn('Sem clinic_settings.alerta_urgencia_telefones', erro)
    return null
  }
}

/** 55 + DDD + celular com o 9, sem repetir, na ordem digitada (o primeiro e o da Dra.). */
export function numerosParaOAviso(texto: string): string[] {
  const numeros = texto
    .split(/[\n,;]+/)
    .map((linha) => linha.replace(/\D/g, ''))
    .filter((digitos) => digitos.length >= 10)
    .map((digitos) => paraEnvio(digitos))
    .filter((numero) => numero.length === 12 || numero.length === 13)
  return [...new Set(numeros)]
}

/** "5513999990001" vira "(13) 99999-0001", para a tela. */
export function telefoneLegivel(numero: string): string {
  const d = numero.replace(/\D/g, '')
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (local.length < 10) return numero
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`
}

export async function saveNumerosDoAviso(clinicId: string, numeros: string[]) {
  const { data, error } = await semTipo
    .from('clinic_settings')
    .update({ alerta_urgencia_telefones: numeros })
    .eq('clinic_id', clinicId)
    .select('clinic_id')
  if (error) throw new Error(`Os números não foram salvos (${error.message})`)
  // A RLS recusa sem erro: o update volta vazio. Calado, a tela diria
  // "salvo" com os numeros antigos no banco.
  if (!data?.length) throw new Error('Os números não foram salvos: só o administrador da clínica pode mudar esta lista.')
}

export type UltimoAviso = { quando: string; quem: string; teste: boolean; resultado: string }

/** O ultimo aviso que saiu (ou falhou), para a tela mostrar sem ninguem ir ao log. */
export async function getUltimoAviso(clinicId: string): Promise<UltimoAviso | null> {
  try {
    const { data, error } = await semTipo
      .from('alertas_de_urgencia')
      .select('criado_em,quem,teste,resultado')
      .eq('clinic_id', clinicId)
      .in('motivo', ['pedido', 'duvida'])
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    const linha = data as { criado_em: string; quem: string; teste: boolean; resultado: string } | null
    return linha ? { quando: linha.criado_em, quem: linha.quem, teste: Boolean(linha.teste), resultado: linha.resultado ?? '' } : null
  } catch (erro) {
    console.warn('Nao li o ultimo aviso do pedido', erro)
    return null
  }
}
