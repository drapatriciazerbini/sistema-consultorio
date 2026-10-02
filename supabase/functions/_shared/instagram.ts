/**
 * Robô no Direct do Instagram (01/10/2026).
 *
 * O Direct não traz telefone, e tudo o que o robô do WhatsApp faz depois do
 * menu depende dele: achar o paciente, marcar, mandar lembrete. Então aqui o
 * robô faz a parte que não precisa de telefone - responder as dúvidas com as
 * MESMAS respostas prontas da tela "Respostas do robô". Quem quer marcar fica
 * no Direct (02/10/2026: trocar de app perdia gente): o robô pede consultório
 * ou casa e o melhor dia, avisa o celular da equipe e espera ela fechar por aqui.
 *
 * Duas metades:
 *  - decidirResposta(): regra pura, sem banco nem rede, coberta por
 *    tests/instagram.test.mjs;
 *  - tratarInstagram(): o que o meta-webhook chama quando o aviso da Meta é do
 *    objeto 'instagram'. Lê e grava o estado da conversa, manda a resposta.
 *
 * Quando o robô fica calado:
 *  - alguém da equipe respondeu há menos de HORAS_DE_SILENCIO horas (pelo
 *    Business Suite ou pelo app do Instagram: a Meta devolve um "eco" de toda
 *    mensagem enviada pela conta, e o eco que não é do robô é de gente);
 *  - ele já respondeu TETO_SEGUIDAS vezes sem ninguém da equipe no meio
 *    (botão tocado, "quero agendar" e "quero falar com alguém" passam mesmo
 *    assim: robô nenhum toca botão; e a conta zera HORAS_DO_MENU depois da
 *    última resposta, para a pessoa que volta no outro dia não achar o robô mudo);
 *  - depois de não entender: avisa que a equipe responde e espera.
 */

import { acharResposta, assuntoClinico, carregarRespostas, type RespostaPronta } from './respostas.ts'
import { parecePergunta, pediuAgendamento, soAgradecimento } from './atendimento.ts'
import { avisarEquipe } from './push-da-equipe.ts'

export const HORAS_DE_SILENCIO = 12
export const TETO_SEGUIDAS = 4
/**
 * Marca de "passou para a equipe" (pediu para agendar, pediu gente, saúde, não
 * entendeu). Nesse estado o robô só responde botão de informação, sem convidar
 * de novo para agendar: o que a pessoa escrever é resposta para a equipe.
 */
export const ESPERANDO_EQUIPE = 99
/** Depois disso a saudação com os botões aparece de novo. */
export const HORAS_DO_MENU = 24

export type BotaoRapido = { titulo: string; payload: string }

/** Os botões que aparecem embaixo da mensagem. Título com até 20 letras. */
export const BOTOES: BotaoRapido[] = [
  { titulo: 'Valores', payload: 'VALOR' },
  { titulo: 'Convênio', payload: 'CONVENIO' },
  { titulo: 'Consulta em casa', payload: 'CASA' },
  { titulo: 'Endereço', payload: 'ENDERECO' },
  // 02/10/2026: "quanto tempo dura?" apareceu em duas conversas do Direct.
  { titulo: 'Como é a consulta', payload: 'COMO' },
  { titulo: 'Agendar', payload: 'AGENDAR' },
  { titulo: 'Falar com a equipe', payload: 'EQUIPE' },
]

/** O botão tocado vira a pergunta que as respostas prontas já entendem. */
const PERGUNTA_DO_BOTAO: Record<string, string> = {
  VALOR: 'qual o valor',
  CONVENIO: 'atende convenio',
  CASA: 'consulta em casa domicilio',
  ENDERECO: 'qual o endereco do consultorio',
  COMO: 'quanto tempo dura a primeira consulta e o que levar',
}

export type EstadoDaConversa = {
  menuEnviadoEm: string | null
  humanoRespondeuEm: string | null
  respostasSeguidas: number
}

export type Decisao = {
  texto: string
  botoes?: BotaoRapido[]
  /** Avisar o celular da equipe: alguém pediu gente. */
  avisar?: boolean
  /** Conta como apresentação (zera o relógio do menu). */
  menu?: boolean
  /** Depois desta, o robô espera a equipe. */
  calarDepois?: boolean
  /** Título do aviso no celular da equipe. */
  motivo?: 'agendar' | 'equipe'
  /** O que contar na aba Instagram da Visão geral (instagram_bot_events). */
  evento?: { tipo: 'menu' | 'resposta' | 'agendar' | 'equipe' | 'agradecimento'; detalhe?: string }
} | null

const SAUDACAO = 'Olá! Aqui é o consultório da Dra. Patrícia Zerbini. Toque numa das opções abaixo ou escreva a sua dúvida:'

/** Já conversando e a pessoa pede "mais informações": botões, sem novo "Olá!". */
const MAIS_INFORMACOES = 'Claro! Sobre o que você quer saber? Toque numa das opções abaixo ou escreva a sua dúvida:'

function pediuMaisInformacoes(texto: string): boolean {
  return /\b(mais informac|informac|saber mais|mais detalhes|tenho duvida|outra duvida|ajuda|nao entendi)/.test(normalizar(texto))
}

const AGENDAR =
  'Que bom! A equipe vai combinar o horário com você aqui mesmo, pelo Direct.\n\n' +
  'Para adiantar, conta pra gente:\n' +
  '• prefere o consultório no Gonzaga ou a consulta em casa?\n' +
  '• qual o melhor dia e período (manhã ou tarde)?'

/** Fecho das respostas prontas: o botão Agendar vem logo embaixo. */
export const CONVITE_PARA_AGENDAR = 'Quer marcar? Toque em Agendar que a equipe combina o horário com você por aqui.'

const EQUIPE = 'Certo! Alguém da equipe vai te responder aqui no Direct assim que possível.'

const CLINICO =
  'Dúvidas sobre saúde, sintomas ou remédios a Dra. Patrícia precisa avaliar com calma, e não respondemos por mensagem automática.\n\n' +
  'Alguém da equipe vai te responder aqui no Direct.\n\n' +
  'Em emergência, ligue 192 (SAMU).'

const NAO_ENTENDI = 'Não consegui entender por aqui. Alguém da equipe vai te responder neste Direct.'

/** Botões que só informam (sem Agendar e sem Falar com a equipe). */
const BOTOES_DE_INFORMACAO = (): BotaoRapido[] => BOTOES.filter((b) => PERGUNTA_DO_BOTAO[b.payload])

const PARA_AGENDAR: Decisao = { texto: AGENDAR, avisar: true, calarDepois: true, motivo: 'agendar', botoes: BOTOES_DE_INFORMACAO(), evento: { tipo: 'agendar' } }

/** "Em casa, terça de manhã": é resposta para a equipe, não dúvida para o robô. */
function respostaDoAgendamento(texto: string): boolean {
  if (texto.includes('?')) return false
  return /\b(casa|domicilio|consultorio|gonzaga|manha|tarde|noite|segunda|terca|quarta|quinta|sexta|sabado|amanha|hoje|dia|semana|horario)\b/.test(normalizar(texto))
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** "Quero falar com alguém", "atendente", "humano". */
export function pediuPessoa(texto: string): boolean {
  const t = normalizar(texto)
  return /\b(atendente|humano|humana|pessoa|secretaria|alguem)\b/.test(t) ||
    /\bfalar com (a |o )?(equipe|doutora|dra|medica)\b/.test(t)
}

/**
 * A resposta pronta foi escrita para o WhatsApp. No Direct o asterisco não
 * vira negrito (aparece o *), e "digite 2" não leva a lugar nenhum: o
 * parágrafo com a instrução do menu sai inteiro.
 */
export function adaptarTexto(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .filter((paragrafo) => !/\bdigite\b/i.test(paragrafo))
    .join('\n\n')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function horasDesde(iso: string | null, agora: Date): number {
  if (!iso) return Infinity
  return (agora.getTime() - new Date(iso).getTime()) / 3_600_000
}

/** Respostas seguidas que ainda contam: a conta zera um dia depois da última resposta do robô. */
export function seguidasQueContam(seguidas: number, roboRespondeuEm: string | null, agora: Date = new Date()): number {
  return horasDesde(roboRespondeuEm, agora) < HORAS_DO_MENU ? seguidas : 0
}

/** Os botões menos o que acabou de ser respondido. */
function outrosBotoes(payload: string | null): BotaoRapido[] {
  return BOTOES.filter((b) => b.payload !== payload)
}

/**
 * O que responder a uma mensagem do Direct. Nulo é ficar calado.
 */
export function decidirResposta(opcoes: {
  texto: string
  /** Payload do botão tocado, quando a pessoa tocou em vez de escrever. */
  payload?: string | null
  respostas: RespostaPronta[]
  estado: EstadoDaConversa
  /** Só o post/anúncio compartilhado, sem texto (vem antes da pergunta). */
  soCompartilhamento?: boolean
  agora?: Date
}): Decisao {
  const agora = opcoes.agora ?? new Date()
  const { estado } = opcoes
  const payload = (opcoes.payload ?? '').trim().toUpperCase() || null
  const texto = (opcoes.texto ?? '').trim()

  // A equipe está na conversa: quem fala é gente.
  if (horasDesde(estado.humanoRespondeuEm, agora) < HORAS_DE_SILENCIO) return null
  // Já falou demais sem ninguém da equipe no meio. Pedido claro passa: botão
  // do próprio robô, querer marcar ou querer gente (outro robô não faz isso).
  const botaoDeInformacao = Boolean(payload && PERGUNTA_DO_BOTAO[payload])
  const esperandoEquipe = estado.respostasSeguidas >= ESPERANDO_EQUIPE
  if (esperandoEquipe) {
    // Responde botão de informação e dúvida curta ("valor", "qual o endereço?").
    // O resto (inclusive "em casa, terça de manhã") é conversa com a equipe.
    let pergunta: string | null = null
    if (botaoDeInformacao) pergunta = PERGUNTA_DO_BOTAO[payload as string]
    else if (!payload && texto && !respostaDoAgendamento(texto) && !assuntoClinico(texto) &&
      (parecePergunta(texto) || texto.split(/\s+/).length <= 2)) pergunta = texto
    if (!pergunta) return null
    const achada = acharResposta(pergunta, opcoes.respostas, 1)
    return achada
      ? { texto: adaptarTexto(achada.resposta), botoes: BOTOES_DE_INFORMACAO().filter((b) => b.payload !== payload), evento: { tipo: 'resposta', detalhe: achada.assunto } }
      : null
  }
  const pedidoClaro = Boolean(payload && BOTOES.some((b) => b.payload === payload)) ||
    (Boolean(texto) && (pediuAgendamento(texto) || pediuPessoa(texto)))
  if (estado.respostasSeguidas >= TETO_SEGUIDAS && !pedidoClaro) return null

  const menuRecente = horasDesde(estado.menuEnviadoEm, agora) < HORAS_DO_MENU

  if (payload === 'AGENDAR') return PARA_AGENDAR
  if (payload === 'EQUIPE') return { texto: EQUIPE, avisar: true, calarDepois: true, evento: { tipo: 'equipe', detalhe: 'pediu' } }

  const pergunta = payload && PERGUNTA_DO_BOTAO[payload] ? PERGUNTA_DO_BOTAO[payload] : texto
  // Quem responde a um anúncio às vezes manda o post compartilhado e, logo
  // depois, a pergunta. O post sozinho não pede resposta (02/10/2026: a
  // pessoa recebia o "Olá!" com os botões e, em seguida, a resposta do valor).
  if (!pergunta && opcoes.soCompartilhamento) return null
  if (!pergunta) {
    // Foto, áudio, figurinha: o robô não lê. Na primeira vez se apresenta; depois, espera a equipe.
    return menuRecente ? null : { texto: SAUDACAO, botoes: BOTOES, menu: true, evento: { tipo: 'menu' } }
  }

  // Saúde não se responde por robô, nem que exista resposta cadastrada.
  if (!payload && assuntoClinico(pergunta)) return { texto: CLINICO, avisar: true, calarDepois: true, evento: { tipo: 'equipe', detalhe: 'saude' } }

  if (!payload && pediuPessoa(pergunta)) return { texto: EQUIPE, avisar: true, calarDepois: true, evento: { tipo: 'equipe', detalhe: 'pediu' } }

  if (!payload && soAgradecimento(pergunta)) {
    // "Obrigada" depois de uma resposta do robô: fecha com gentileza, sem menu.
    return menuRecente ? { texto: 'Por nada! Qualquer outra dúvida, é só chamar por aqui.', evento: { tipo: 'agradecimento' } } : null
  }

  if (!payload && pediuAgendamento(pergunta)) return PARA_AGENDAR

  const achada = acharResposta(pergunta, opcoes.respostas, 1)
  if (achada) {
    const corpo = adaptarTexto(achada.resposta)
    return {
      texto: `${corpo}\n\n${CONVITE_PARA_AGENDAR}`,
      botoes: outrosBotoes(payload),
      evento: { tipo: 'resposta', detalhe: achada.assunto },
    }
  }

  // Já conversando (o robô respondeu nas últimas 24 horas): nada de "Olá!" de
  // novo. "Preciso de mais informações" ganha os botões; pergunta que o robô
  // não sabe ("tem desconto pra 2 pessoas?") vai para a equipe (02/10/2026).
  const jaConversou = estado.respostasSeguidas > 0
  if (pediuMaisInformacoes(pergunta) && (jaConversou || menuRecente)) {
    return { texto: MAIS_INFORMACOES, botoes: BOTOES, menu: true, evento: { tipo: 'menu' } }
  }

  // Primeira mensagem (ou a primeira do dia): apresentação com os botões.
  if (!menuRecente && !jaConversou) return { texto: SAUDACAO, botoes: BOTOES, menu: true, evento: { tipo: 'menu' } }

  // Já se apresentou e mesmo assim não entendeu: passa para a equipe e espera.
  return { texto: NAO_ENTENDI, avisar: true, calarDepois: true, evento: { tipo: 'equipe', detalhe: 'nao_entendeu' } }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

type Admin = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

type EventoDoDirect = {
  /** Quando a conversa vem de um anúncio a Meta às vezes manda isto aqui... */
  referral?: { ad_id?: string; source?: string }
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    is_deleted?: boolean
    is_unsupported?: boolean
    quick_reply?: { payload?: string }
    /** ...e às vezes dentro da mensagem. */
    referral?: { ad_id?: string; source?: string }
    attachments?: unknown[]
  }
}

type Registro = {
  registrar(chave: string, tipo: string, payload: unknown): Promise<'novo' | 'repetido'>
  concluir(): void
}

/**
 * Para onde vai o envio. Chave gerada pelo login do Instagram comeca com "IG"
 * e so vale em graph.instagram.com; chave de Pagina (login do Facebook) vale em
 * graph.facebook.com. Assim qualquer uma das duas que for colada no segredo
 * INSTAGRAM_PAGE_TOKEN funciona.
 */
export function hostDoToken(token: string): string {
  return token.trim().startsWith('IG') ? 'graph.instagram.com' : 'graph.facebook.com'
}

/** Segundos depois do envio em que um eco ainda e considerado do robo. */
export const JANELA_DO_ECO = 90

/** O eco e da resposta do robo (e nao de alguem da equipe)? */
export function ecoDoRobo(mid: string, ultimaDoRobo: string | null, roboFalouEm: string | null, agora: Date): boolean {
  if (ultimaDoRobo && mid === ultimaDoRobo) return true
  if (!roboFalouEm) return false
  return (agora.getTime() - new Date(roboFalouEm).getTime()) / 1000 < JANELA_DO_ECO
}

/** Monta o corpo do envio para a Meta. Puro, para o teste conferir. */
export function corpoDoEnvio(destinatario: string, decisao: NonNullable<Decisao>) {
  const texto = decisao.texto.length > 1000 ? `${decisao.texto.slice(0, 997)}...` : decisao.texto
  return {
    recipient: { id: destinatario },
    messaging_type: 'RESPONSE',
    message: {
      text: texto,
      ...(decisao.botoes?.length
        ? {
            quick_replies: decisao.botoes.slice(0, 13).map((b) => ({
              content_type: 'text',
              title: b.titulo.slice(0, 20),
              payload: b.payload,
            })),
          }
        : {}),
    },
  }
}

async function enviar(destinatario: string, decisao: NonNullable<Decisao>): Promise<string | null> {
  const token = Deno.env.get('INSTAGRAM_PAGE_TOKEN')?.trim()
  if (!token) {
    console.warn('Instagram: falta o segredo INSTAGRAM_PAGE_TOKEN; o robo nao responde')
    return null
  }
  const versao = Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0'
  const resposta = await fetch(`https://${hostDoToken(token)}/${versao}/me/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpoDoEnvio(destinatario, decisao)),
  })
  const corpo = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    console.error('Instagram: a Meta recusou o envio', resposta.status, corpo?.error?.message ?? '')
    return null
  }
  return String(corpo?.message_id ?? '') || null
}

/**
 * Conta uma coisa que aconteceu na conversa (aba Instagram da Visão geral).
 * Falha aqui não pode virar 500: a Meta reenviaria o aviso e a pessoa
 * receberia a resposta duas vezes. Por isso só avisa no log.
 */
async function contar(admin: Admin, clinicId: string, conversaId: string, evento: string, detalhe = '') {
  const { error } = await admin
    .from('instagram_bot_events')
    .insert({ clinic_id: clinicId, conversation_id: conversaId, evento, detalhe: detalhe.slice(0, 80) })
  if (error) console.warn('Instagram: nao contei o evento', evento, error.message)
}

/**
 * Trata um aviso da Meta do objeto 'instagram'. Erro de banco sobe para o
 * meta-webhook, que devolve 500 e libera o evento para o reenvio.
 */
export async function tratarInstagram(admin: Admin, payload: { entry?: unknown[] }, registro: Registro) {
  for (const bruto of payload.entry ?? []) {
    const entrada = bruto as { id?: string; messaging?: EventoDoDirect[] }
    for (const evento of entrada.messaging ?? []) {
      registro.concluir()
      const mensagem = evento.message
      if (!mensagem?.mid || mensagem.is_deleted || mensagem.is_unsupported) continue

      const conta = String(entrada.id ?? '')
      const eco = Boolean(mensagem.is_echo)
      // No eco quem manda é a conta da clínica e quem recebe é a pessoa.
      const pessoa = String((eco ? evento.recipient?.id : evento.sender?.id) ?? '')
      if (!conta || !pessoa) continue

      if ((await registro.registrar(`instagram:${mensagem.mid}`, 'instagram_message', { entry_id: conta })) === 'repetido') {
        continue
      }

      const { data: settings, error: erroDaClinica } = await admin
        .from('clinic_settings')
        .select('clinic_id,whatsapp_autoreply_enabled')
        .overlaps('instagram_account_ids', [conta, String(evento.recipient?.id ?? ''), String(evento.sender?.id ?? '')].filter(Boolean))
        .limit(1)
        .maybeSingle()
      if (erroDaClinica) throw erroDaClinica
      if (!settings?.clinic_id) {
        console.warn('Instagram: conta sem clinica ligada', conta)
        continue
      }
      const clinicId = settings.clinic_id as string
      const agora = new Date()

      const { data: conversa, error: erroDaConversa } = await admin
        .from('instagram_conversations')
        .upsert({ clinic_id: clinicId, ig_user_id: pessoa }, { onConflict: 'clinic_id,ig_user_id', ignoreDuplicates: false })
        .select('id,menu_sent_at,last_human_reply_at,last_bot_reply_at,last_bot_message_id,bot_replies_in_row')
        .single()
      if (erroDaConversa) throw erroDaConversa

      if (eco) {
        // O eco da resposta do proprio robo nao e da equipe. O eco pode chegar
        // antes de o id da resposta ser gravado (a Meta avisa em paralelo), por
        // isso tambem vale o eco que chega logo depois de o robo comecar a enviar.
        if (ecoDoRobo(mensagem.mid, conversa.last_bot_message_id ?? null, conversa.last_bot_reply_at ?? null, agora)) continue
        const { error } = await admin
          .from('instagram_conversations')
          .update({ last_human_reply_at: agora.toISOString(), bot_replies_in_row: 0 })
          .eq('id', conversa.id)
        if (error) throw error
        await contar(admin, clinicId, conversa.id, 'equipe_respondeu')
        continue
      }

      await admin
        .from('instagram_conversations')
        .update({ last_inbound_at: agora.toISOString() })
        .eq('id', conversa.id)

      await contar(admin, clinicId, conversa.id, 'mensagem')
      if (mensagem.quick_reply?.payload) await contar(admin, clinicId, conversa.id, 'botao', mensagem.quick_reply.payload)
      const anuncio = evento.referral ?? mensagem.referral
      if (anuncio) await contar(admin, clinicId, conversa.id, 'anuncio', String(anuncio.ad_id ?? anuncio.source ?? ''))

      // O mesmo interruptor do WhatsApp liga e desliga o robo daqui.
      if (!settings.whatsapp_autoreply_enabled) continue

      const respostas = await carregarRespostas(admin, clinicId)
      const seguidas = seguidasQueContam(Number(conversa.bot_replies_in_row ?? 0), conversa.last_bot_reply_at ?? null, agora)
      const anexos = (mensagem.attachments ?? []) as Array<{ type?: string }>
      const decisao = decidirResposta({
        texto: mensagem.text ?? '',
        payload: mensagem.quick_reply?.payload ?? null,
        soCompartilhamento: anexos.length > 0 && anexos.every((a) => !['image', 'audio', 'video', 'file'].includes(String(a?.type ?? ''))),
        respostas,
        estado: {
          menuEnviadoEm: conversa.menu_sent_at ?? null,
          humanoRespondeuEm: conversa.last_human_reply_at ?? null,
          respostasSeguidas: seguidas,
        },
        agora,
      })
      if (!decisao) continue

      // Marca antes de enviar: o eco da Meta pode chegar antes do fim do envio.
      await admin
        .from('instagram_conversations')
        .update({ last_bot_reply_at: agora.toISOString() })
        .eq('id', conversa.id)

      const enviada = await enviar(pessoa, decisao)
      if (!enviada) continue

      const { error: erroDoEstado } = await admin
        .from('instagram_conversations')
        .update({
          last_bot_reply_at: agora.toISOString(),
          last_bot_message_id: enviada,
          bot_replies_in_row: decisao.calarDepois || seguidas >= ESPERANDO_EQUIPE ? ESPERANDO_EQUIPE : Math.min(seguidas + 1, TETO_SEGUIDAS),
          ...(decisao.menu ? { menu_sent_at: agora.toISOString() } : {}),
        })
        .eq('id', conversa.id)
      if (erroDoEstado) throw erroDoEstado
      if (decisao.evento) await contar(admin, clinicId, conversa.id, decisao.evento.tipo, decisao.evento.detalhe ?? '')

      if (decisao.avisar) {
        const resumo = (mensagem.text ?? '').replace(/\s+/g, ' ').trim()
        await avisarEquipe(admin, clinicId, {
          titulo: decisao.motivo === 'agendar' ? 'Instagram: querem agendar' : 'Instagram: pediram para falar com a equipe',
          corpo: resumo ? (resumo.length > 140 ? `${resumo.slice(0, 137)}…` : resumo) : 'Responda pelo Direct do Instagram.',
          etiqueta: `instagram-${conversa.id}`,
          conversa: '',
          urgente: false,
        })
      }
    }
  }
}
