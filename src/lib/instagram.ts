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

/**
 * Anexo do Direct (08/11/2026). `url` e o link temporario do acervo quando o
 * arquivo foi guardado; `original` e o link da Meta, que vence, e so serve de
 * ultimo recurso. `caminho` nulo quer dizer que o servidor nao conseguiu
 * guardar - a tela diz isso, em vez de esconder.
 */
export interface AnexoInstagram {
  tipo: string
  mime: string | null
  caminho: string | null
  url: string | null
  original: string | null
}

export interface MensagemInstagram {
  id: string
  direcao: 'inbound' | 'outbound'
  autor: 'pessoa' | 'robo' | 'equipe'
  texto: string
  status: 'recebida' | 'enviada' | 'falhou'
  erro: string | null
  createdAt: string
  anexos: AnexoInstagram[]
}

/**
 * Quando o robo viu a chave do Instagram recusada pela Meta (03/11/2026): de
 * 31/10 a 03/11 ele ficou mudo no Direct e so a conversa aberta mostrava. A
 * coluna e nova, entao vem em consulta separada: sem ela, a tela abre sem a
 * faixa, mas abre.
 */
export async function chaveDoInstagramRecusadaEm(clinicId: string): Promise<string | null> {
  try {
    const { data, error } = await semTipo
      .from('clinic_settings')
      .select('instagram_chave_recusada_em')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (error) throw error
    return (data as { instagram_chave_recusada_em?: string | null } | null)?.instagram_chave_recusada_em ?? null
  } catch (erro) {
    console.warn('Instagram: sem a marca da chave recusada', erro)
    return null
  }
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
  const anexos = await anexosDaConversa(conversaId)
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
    anexos: anexos.get(m.id) ?? [],
  }))
}

/**
 * Os anexos da conversa, cada arquivo guardado com um link de cinco minutos.
 *
 * Consulta a parte, dentro de try/catch: a coluna anexos e de 08/11/2026, e
 * pedir coluna nova na consulta principal derruba a tela inteira enquanto a
 * migration nao roda (licao de 19/09/2026). Sem ela, a conversa abre so com os
 * rotulos, como antes.
 */
async function anexosDaConversa(conversaId: string): Promise<Map<string, AnexoInstagram[]>> {
  const porMensagem = new Map<string, AnexoInstagram[]>()
  try {
    const { data, error } = await semTipo
      .from('instagram_messages')
      .select('id,anexos')
      .eq('conversation_id', conversaId)
      .limit(500)
    if (error) throw error
    type Bruto = { tipo?: string; url?: string | null; path?: string | null; mime?: string | null }
    const linhas = ((data ?? []) as { id: string; anexos: Bruto[] | null }[]).filter((l) => Array.isArray(l.anexos) && l.anexos.length)
    const caminhos = linhas.flatMap((l) => (l.anexos ?? []).map((a) => a.path).filter((p): p is string => Boolean(p)))
    const links = new Map<string, string>()
    if (caminhos.length) {
      const { data: assinados, error: erroDosLinks } = await supabase.storage.from('instagram-anexos').createSignedUrls(caminhos, 300)
      if (erroDosLinks) console.warn('Instagram: sem link para os anexos', erroDosLinks)
      for (const l of assinados ?? []) if (l.path && l.signedUrl) links.set(l.path, l.signedUrl)
    }
    for (const linha of linhas) {
      porMensagem.set(
        linha.id,
        (linha.anexos ?? []).map((a) => ({
          tipo: String(a.tipo ?? 'desconhecido'),
          mime: a.mime ?? null,
          caminho: a.path ?? null,
          url: a.path ? (links.get(a.path) ?? null) : null,
          original: a.url ?? null,
        })),
      )
    }
  } catch (erro) {
    console.warn('Instagram: sem os anexos da conversa (migration 20261108120000 aplicada?)', erro)
  }
  return porMensagem
}

/** Link novo, de cinco minutos, para um anexo guardado (o da conversa vence). */
export async function linkDoAnexoInstagram(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from('instagram-anexos').createSignedUrl(caminho, 300)
  if (error || !data?.signedUrl) throw new Error('Não consegui abrir o anexo. Tente de novo.')
  return data.signedUrl
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
