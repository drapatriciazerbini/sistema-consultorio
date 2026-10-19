import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { motivoDaFuncao } from '@/lib/repository'

/**
 * Chat do Direct do Instagram na Central (19/10/2026).
 *
 * So leitura e resposta: o robo continua respondendo no Direct sozinho, e o
 * historico e gravado pelo servidor (meta-webhook). As tabelas sao novas e nao
 * estao nos tipos gerados do banco, por isso o cliente sem tipo.
 */
const semTipo = supabase as unknown as SupabaseClient

export interface ConversaInstagram {
  id: string
  nome: string
  naoLidas: number
  ultimaMensagemEm: string | null
  ultimaDaPessoaEm: string | null
  equipeRespondeuEm: string | null
  previa: string
  previaDe: 'pessoa' | 'robo' | 'equipe' | null
}

export interface MensagemInstagram {
  id: string
  direcao: 'inbound' | 'outbound'
  autor: 'pessoa' | 'robo' | 'equipe'
  texto: string
  status: 'recebida' | 'enviada' | 'falhou'
  erro: string | null
  createdAt: string
}

/** A Meta so deixa responder ate 24 h depois da ultima mensagem da pessoa. */
export function podeResponder(c: Pick<ConversaInstagram, 'ultimaDaPessoaEm'>, agora = Date.now()): boolean {
  return Boolean(c.ultimaDaPessoaEm && agora - Date.parse(c.ultimaDaPessoaEm) < 24 * 3_600_000)
}

export async function listarConversasInstagram(clinicId: string): Promise<ConversaInstagram[]> {
  const { data, error } = await semTipo
    .from('instagram_conversations')
    .select('id,first_name,unread_count,last_message_at,last_inbound_at,last_human_reply_at')
    .eq('clinic_id', clinicId)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(200)
  if (error) throw new Error('Não consegui ler as conversas do Instagram. ' + error.message)
  type Linha = {
    id: string
    first_name: string | null
    unread_count: number | null
    last_message_at: string | null
    last_inbound_at: string | null
    last_human_reply_at: string | null
  }
  const linhas = (data ?? []) as Linha[]
  // Previa: a ultima mensagem de cada conversa. Falhou, a lista abre sem ela.
  const previas = new Map<string, { texto: string; autor: MensagemInstagram['autor'] }>()
  if (linhas.length) {
    const { data: ultimas, error: erroDasPrevias } = await semTipo
      .from('instagram_messages')
      .select('conversation_id,body,author,created_at')
      .in('conversation_id', linhas.map((l) => l.id))
      .order('created_at', { ascending: false })
      .limit(1000)
    if (erroDasPrevias) console.warn('Instagram: sem a previa das conversas', erroDasPrevias)
    for (const m of (ultimas ?? []) as { conversation_id: string; body: string; author: MensagemInstagram['autor'] }[]) {
      if (!previas.has(m.conversation_id)) previas.set(m.conversation_id, { texto: m.body, autor: m.author })
    }
  }
  return linhas.map((l) => ({
    id: l.id,
    nome: (l.first_name ?? '').trim() || 'Pessoa do Instagram',
    naoLidas: Number(l.unread_count ?? 0),
    ultimaMensagemEm: l.last_message_at,
    ultimaDaPessoaEm: l.last_inbound_at,
    equipeRespondeuEm: l.last_human_reply_at,
    previa: previas.get(l.id)?.texto ?? '',
    previaDe: previas.get(l.id)?.autor ?? null,
  }))
}

export async function listarMensagensInstagram(conversaId: string): Promise<MensagemInstagram[]> {
  const { data, error } = await semTipo
    .from('instagram_messages')
    .select('id,direction,author,body,status,error,created_at')
    .eq('conversation_id', conversaId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) throw new Error('Não consegui ler a conversa. ' + error.message)
  return ((data ?? []) as {
    id: string
    direction: MensagemInstagram['direcao']
    author: MensagemInstagram['autor']
    body: string
    status: MensagemInstagram['status']
    error: string | null
    created_at: string
  }[]).map((m) => ({
    id: m.id,
    direcao: m.direction,
    autor: m.author,
    texto: m.body,
    status: m.status,
    erro: m.error,
    createdAt: m.created_at,
  }))
}

export async function marcarInstagramComoLida(conversaId: string): Promise<void> {
  const { error } = await semTipo.from('instagram_conversations').update({ unread_count: 0 }).eq('id', conversaId)
  if (error) console.warn('Instagram: nao zerei as nao lidas', error)
}

export async function responderInstagram(conversaId: string, texto: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('instagram-responder', {
    body: { conversationId: conversaId, text: texto },
  })
  if (error) throw new Error(await motivoDaFuncao(error, data, 'Não foi possível enviar.'))
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error)
}
