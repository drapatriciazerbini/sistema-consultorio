import { gravarNota, type MotivoDoAlerta, type Veredito } from './alerta-de-urgencia.ts'
import { montarConteudo } from './conteudo.ts'
import { postarNaMeta } from './meta-tentativa.ts'
import { textoDoModelo } from './modelos.ts'
import { primeiroNomeUtil } from './nome.ts'
import { quemAtende, type QuemAtende } from './quem-atende.ts'
import { carregarRespostas, valorCadastrado } from './respostas.ts'
import { mesmoTelefone } from './telefone-br.ts'

/**
 * A resposta da Dra. Patricia ao aviso do pedido, pelo WhatsApp dela
 * (28/10/2026).
 *
 * Pedido do Edu em 27/10/2026: o aviso chega no celular da Dra., e a resposta
 * dela volta ao paciente sem ela abrir a Central. Tres jeitos:
 *   - "Eu respondo": o paciente fica sabendo que ela viu o pedido e vai falar
 *     com ele. Sai como mensagem de gente, e o robo fica quieto (a regra das
 *     12 horas de conversa humana, ver equipeFalouRecentemente em lembrete.ts);
 *   - "Mandar os valores": a resposta pronta de valor, a mesma que o robo usa
 *     antes de pedir o nome (caso de 19/10/2026: um paciente pediu consulta
 *     pelo robo, a equipe confirmou o horario a mao e ninguem falou de valor
 *     nem de particular);
 *   - escrever a mensagem. O robo mostra o que vai mandar e espera o
 *     "Enviar": e mensagem em nome dela, e um "liga pra ela" que era para a
 *     equipe nao pode chegar ao paciente.
 *
 * Porte da resposta ao alerta de urgencia do sistema do Dr. Marcello
 * (17/10/2026). Quem e quem: o primeiro numero da lista e o da Dra.; os outros
 * respondem como equipe.
 *
 * Mensagem desses numeros so vira resposta ao aviso quando e um toque nos
 * botoes, quando responde em cima de um aviso, ou quando houve aviso nas
 * ultimas 6 horas. Fora disso segue o robo de sempre - e assim que a equipe
 * continua testando o robo pelo proprio celular. Isso tambem acaba com a
 * Dra. escrevendo para o numero do consultorio e recebendo o menu como se
 * fosse paciente, mas so nessas condicoes.
 */

// Tabela nova: lida em consulta separada, com try/catch.
type Admin = { from: (tabela: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

const JANELA_DO_AVISO_MS = 6 * 3600 * 1000
const JANELA_DA_META_MS = 24 * 3600 * 1000
/** Mensagem dela cabe numa mensagem com botoes (1024) junto da pergunta. */
const LIMITE_DO_TEXTO = 900

export type MensagemRecebida = {
  type?: string
  text?: { body?: string }
  button?: { text?: string; payload?: string }
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } }
  /** A mensagem nossa em cima da qual ela respondeu. */
  context?: { id?: string }
}

export type RespostaDaEquipe =
  | { tipo: 'veredito'; alertaId: string; veredito: Veredito }
  | { tipo: 'confirmacao'; alertaId: string; acao: 'enviar' | 'cancelar' }
  | { tipo: 'texto'; texto: string; citado: string | null }
  | { tipo: 'visto'; citado: string | null }
  | { tipo: 'midia'; citado: string | null }

export const payloadDaConfirmacao = (alertaId: string, acao: 'enviar' | 'cancelar', motivo: MotivoDoAlerta = 'pedido') =>
  `${motivo === 'urgencia' ? 'URG' : 'PED'}TXT:${alertaId}:${acao}`

// "ok", "vi", um 👍: e a Dra. dizendo que viu, nao mensagem para o paciente.
const VISTO = /^(ok|okay|oks|vi|visto|certo|ciente|beleza|blz|obrigad[oa]|valeu|ta bom|tá bom|entendi|combinado|👍|👌|🙏|✅)[\s!.👍👌🙏✅]*$/iu
const MIDIA = ['image', 'audio', 'voice', 'video', 'document', 'sticker']

export function lerRespostaDaEquipe(m: MensagemRecebida): RespostaDaEquipe | null {
  const citado = m.context?.id ? String(m.context.id) : null
  const toque =
    m.type === 'button'
      ? String(m.button?.payload ?? '')
      : m.type === 'interactive'
        ? String(m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? '')
        : ''
  const veredito = /^(?:PED|URG):([0-9a-f-]{36}):(responde|valores|urgente|aguardar)$/.exec(toque)
  if (veredito) return { tipo: 'veredito', alertaId: veredito[1], veredito: veredito[2] as Veredito }
  const confirmacao = /^(?:PED|URG)TXT:([0-9a-f-]{36}):(enviar|cancelar)$/.exec(toque)
  if (confirmacao) return { tipo: 'confirmacao', alertaId: confirmacao[1], acao: confirmacao[2] as 'enviar' | 'cancelar' }
  // Outro botao (do lembrete, do menu): nao e daqui.
  if (toque) return null
  if (m.type === 'text') {
    const texto = String(m.text?.body ?? '').trim()
    if (!texto) return null
    return VISTO.test(texto) ? { tipo: 'visto', citado } : { tipo: 'texto', texto, citado }
  }
  if (MIDIA.includes(String(m.type))) return { tipo: 'midia', citado }
  return null
}

export type Papel = 'medica' | 'equipe'

/** O primeiro numero da lista e o da Dra.; os outros, equipe; fora da lista, ninguem. */
export function papelDoNumero(numero: string, numeros: string[]): Papel | null {
  const i = numeros.findIndex((n) => mesmoTelefone(n, numero))
  return i < 0 ? null : i === 0 ? 'medica' : 'equipe'
}

/**
 * O que o paciente le. Adulto ou idoso, ou quem cuida dele: nada de
 * "familia" nem de crianca. Os textos em nome da Dra. precisam do aval dela.
 */
export function textoParaOPaciente(tipo: 'responde' | 'texto', papel: Papel, quem: Pick<QuemAtende, 'o' | 'O'>, texto = ''): string {
  if (papel === 'medica') {
    return tipo === 'responde' ? `${quem.O} viu o seu pedido e vai falar com você por aqui.` : `💬 Mensagem d${quem.o}: ${texto}`
  }
  return tipo === 'responde' ? 'Nossa equipe viu o seu pedido e vai falar com você por aqui.' : `💬 Mensagem da equipe do consultório: ${texto}`
}

export type Alerta = {
  id: string
  motivo?: string | null
  conversa_whatsapp: string | null
  teste: boolean
  quem: string
  mensagens: string[]
  veredito: string | null
  responde_em?: string | null
  valores_em?: string | null
  rascunho: string | null
  rascunho_de: string | null
  rascunho_em: string | null
  criado_em: string
}

/** A ultima resposta deste numero: a que aviso e quando (ver ultimaResposta). */
export type UltimaResposta = { id: string; em: string } | null

/**
 * De qual paciente e o texto. Em cima de um aviso: aquele. Sem citar: o aviso
 * das ultimas 6 horas, se for um so. Com mais de um, o da ultima resposta deste
 * numero, enquanto nao chegar aviso novo depois dela (no sistema de origem, em
 * 18/10/2026, o Edu tocou "Eu respondo" num aviso e cada mensagem seguinte
 * voltava "Ha 2 avisos recentes"). Aviso novo depois da ultima resposta:
 * pergunta, porque a mensagem pode ser para o paciente novo.
 */
export function escolherAlerta(
  recentes: Alerta[],
  citado: string | null,
  agora: Date,
  ultima: UltimaResposta = null,
): { alerta: Alerta } | { ambiguos: Alerta[] } | null {
  if (citado) {
    const exato = recentes.find((a) => (a.mensagens ?? []).includes(citado))
    if (exato) return { alerta: exato }
  }
  const candidatos = recentes.filter((a) => agora.getTime() - Date.parse(a.criado_em) <= JANELA_DO_AVISO_MS)
  if (candidatos.length === 1) return { alerta: candidatos[0] }
  if (candidatos.length > 1) {
    const daConversa = ultima ? candidatos.find((a) => a.id === ultima.id) : undefined
    const chegouOutro = candidatos.some((a) => a.id !== ultima?.id && Date.parse(a.criado_em) > Date.parse(ultima?.em ?? ''))
    if (daConversa && !chegouOutro) return { alerta: daConversa }
    return { ambiguos: candidatos }
  }
  return null
}

type Enviado = { ok: true; id: string | null } | { ok: false; erro: string }

export type AmbienteDaResposta = {
  admin: Admin
  clinicId: string
  agora: Date
  /** Os numeros do aviso, ja lidos (o primeiro e o da Dra.). */
  numeros: string[]
  /** Uma mensagem pelo WhatsApp da clinica: para a Dra. ou para o paciente. */
  enviarWhatsApp: (para: string, conteudo: Record<string, unknown>) => Promise<Enviado>
}

/** O envio de verdade, para o webhook. */
export function whatsAppPelaApi(phoneNumberId: string, token: string | undefined, buscar: typeof fetch = fetch): AmbienteDaResposta['enviarWhatsApp'] {
  const versao = (typeof Deno !== 'undefined' ? Deno.env.get('META_GRAPH_VERSION')?.trim() : '') || 'v25.0'
  return async (para, conteudo) => {
    if (!token) return { ok: false, erro: 'WhatsApp da clínica sem token no servidor' }
    try {
      // Erro passageiro da Meta tenta de novo (26/10/2026, ver meta-tentativa.ts).
      const r = await postarNaMeta(`https://graph.facebook.com/${versao}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: para, ...conteudo }),
      }, { buscar })
      const j = await r.json().catch(() => ({}))
      return r.ok ? { ok: true, id: j?.messages?.[0]?.id ?? null } : { ok: false, erro: String(j?.error?.message ?? `HTTP ${r.status}`) }
    } catch (erro) {
      return { ok: false, erro: String(erro).slice(0, 200) }
    }
  }
}

const COLUNAS = 'id,motivo,conversa_whatsapp,teste,quem,mensagens,veredito,responde_em,valores_em,rascunho,rascunho_de,rascunho_em,criado_em'

async function alertasRecentes(amb: AmbienteDaResposta): Promise<Alerta[] | null> {
  try {
    const { data, error } = await amb.admin
      .from('alertas_de_urgencia')
      .select(COLUNAS)
      .eq('clinic_id', amb.clinicId)
      .gte('criado_em', new Date(amb.agora.getTime() - JANELA_DA_META_MS).toISOString())
      .order('criado_em', { ascending: false })
      .limit(20)
    if (error) throw error
    return (data ?? []) as Alerta[]
  } catch (erro) {
    // Sem a tabela, a mensagem segue o caminho de sempre: nada se perde.
    console.error('Resposta ao aviso: nao li alertas_de_urgencia', erro)
    return null
  }
}

async function ultimaResposta(amb: AmbienteDaResposta, numero: string): Promise<UltimaResposta> {
  try {
    const { data, error } = await amb.admin
      .from('alertas_de_urgencia')
      .select('id,respondido_em')
      .eq('clinic_id', amb.clinicId)
      .eq('respondido_por', numero)
      .gte('respondido_em', new Date(amb.agora.getTime() - JANELA_DO_AVISO_MS).toISOString())
      .order('respondido_em', { ascending: false })
      .limit(1)
    if (error) throw error
    const linha = (data as { id: string; respondido_em: string }[] | null)?.[0]
    return linha ? { id: linha.id, em: linha.respondido_em } : null
  } catch (erro) {
    console.warn('Resposta ao aviso: sem respondido_em; a conversa ativa nao vale', erro)
    return null
  }
}

async function marcarRespondido(amb: AmbienteDaResposta, id: string, numero: string) {
  try {
    const { error } = await amb.admin
      .from('alertas_de_urgencia')
      .update({ respondido_em: amb.agora.toISOString(), respondido_por: numero })
      .eq('id', id)
    if (error) throw error
  } catch (erro) {
    console.warn('Resposta ao aviso: respondido_em nao gravado', erro)
  }
}

/** O primeiro toque ou texto fica como veredito (contagem); os seguintes nao mudam. */
async function primeiroVeredito(amb: AmbienteDaResposta, id: string, veredito: Veredito | 'texto', numero: string) {
  try {
    await amb.admin
      .from('alertas_de_urgencia')
      .update({ veredito, veredito_por: numero, veredito_em: amb.agora.toISOString() })
      .eq('id', id)
      .is('veredito', null)
  } catch (erro) {
    console.warn('Resposta ao aviso: veredito nao gravado', erro)
  }
}

async function alertaPorId(amb: AmbienteDaResposta, id: string): Promise<Alerta | null> {
  const { data } = await amb.admin.from('alertas_de_urgencia').select(COLUNAS).eq('id', id).eq('clinic_id', amb.clinicId).maybeSingle()
  return (data as Alerta | null) ?? null
}

/**
 * Manda ao paciente pelo numero do consultorio. Janela de 24 horas aberta (o
 * normal: ele acabou de pedir) vai como texto; fechada, pelo modelo aprovado
 * resposta_da_clinica, como faz a Central (whatsapp-reopen). A mensagem entra
 * no historico da conversa como as outras.
 */
async function enviarParaOPaciente(
  amb: AmbienteDaResposta,
  alerta: Alerta,
  escrito: string,
  automatico: boolean,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { admin, clinicId, agora } = amb
  const agoraIso = agora.toISOString()
  if (!alerta.conversa_whatsapp) return { ok: false, erro: 'aviso sem conversa' }
  const { data: conversa } = await admin
    .from('whatsapp_conversations')
    .select('id,wa_id,patient_id,profile_name,status')
    .eq('id', alerta.conversa_whatsapp)
    .maybeSingle()
  if (!conversa?.wa_id) return { ok: false, erro: 'conversa do WhatsApp não encontrada' }
  if (conversa.status === 'opted_out') return { ok: false, erro: 'o paciente pediu para não receber mensagens' }

  // Ultima mensagem RECEBIDA, como em whatsapp-reply: a janela e dela.
  const { data: ultima } = await admin
    .from('whatsapp_messages')
    .select('created_at')
    .eq('conversation_id', conversa.id)
    .eq('direction', 'inbound')
    .neq('message_type', 'unsupported')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const aberta = Boolean(ultima?.created_at) && agora.getTime() - Date.parse(ultima.created_at) < JANELA_DA_META_MS

  let conteudo: Record<string, unknown>
  let tipoDaMensagem = 'text'
  let modelo: string | null = null
  let noHistorico = escrito
  if (aberta) {
    conteudo = montarConteudo(escrito)
  } else {
    const { data: ajustes } = await admin
      .from('clinic_settings')
      .select('whatsapp_reply_template_name,whatsapp_template_language')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    modelo = (ajustes?.whatsapp_reply_template_name as string | undefined) || 'resposta_da_clinica'
    // O nome do cadastro vale mais que o do perfil; sem nenhum util, o mesmo
    // "tudo bem" do whatsapp-reopen (a Meta recusa parametro vazio).
    let nome = primeiroNomeUtil(conversa.profile_name)
    if (conversa.patient_id) {
      const { data: paciente } = await admin.from('patients').select('name').eq('id', conversa.patient_id).maybeSingle()
      if (paciente?.name) nome = primeiroNomeUtil(paciente.name, true)
    }
    // Parametro de modelo nao aceita quebra de linha nem espacos seguidos.
    const parametros = [nome ?? 'tudo bem', escrito.replace(/\s+/g, ' ').trim().slice(0, 900)]
    conteudo = {
      type: 'template',
      template: {
        name: modelo,
        language: { code: ajustes?.whatsapp_template_language || 'pt_BR' },
        components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }],
      },
    }
    tipoDaMensagem = 'template'
    noHistorico = textoDoModelo(modelo, parametros) ?? escrito
  }

  const envio = await amb.enviarWhatsApp(conversa.wa_id, conteudo)
  const { error: erroDoRegistro } = await admin.from('whatsapp_messages').insert({
    clinic_id: clinicId,
    conversation_id: conversa.id,
    patient_id: conversa.patient_id ?? null,
    external_message_id: envio.ok ? envio.id : null,
    direction: 'outbound',
    // "Eu respondo" e a mensagem dela sao gente falando: o robo fica quieto.
    // O valor e resposta pronta: o robo segue ativo.
    automatic: automatico,
    message_type: tipoDaMensagem,
    template_name: modelo,
    body: noHistorico,
    status: envio.ok ? 'accepted' : 'failed',
    ...(envio.ok ? { sent_at: agoraIso } : { failed_at: agoraIso, failure_reason: envio.erro }),
  })
  if (erroDoRegistro) console.error('Resposta ao aviso: mensagem ao paciente nao registrada', erroDoRegistro)
  await admin.from('whatsapp_conversations').update({ last_message_at: agoraIso }).eq('id', conversa.id)
  return envio.ok ? { ok: true } : { ok: false, erro: envio.erro }
}

/** Nota na conversa do paciente e evento nos Numeros do WhatsApp. */
async function registrarResposta(amb: AmbienteDaResposta, alerta: Alerta, nota: string, detalhe: string) {
  await gravarNota(amb.admin, amb.clinicId, alerta.conversa_whatsapp, nota)
  if (!alerta.conversa_whatsapp) return
  try {
    const { error } = await amb.admin.from('whatsapp_bot_events').insert({
      clinic_id: amb.clinicId,
      conversation_id: alerta.conversa_whatsapp,
      evento: 'resposta_ao_aviso',
      detalhe: detalhe.slice(0, 120),
    })
    if (error) console.error('Resposta ao aviso: evento nao gravado', error)
  } catch (erro) {
    console.error('Resposta ao aviso: evento nao gravado', erro)
  }
}

/** "A Dra. Patricia" ou "A equipe (final 1234)", no comeco da nota. */
function quemRespondeu(papel: Papel, numero: string, quem: QuemAtende): string {
  return papel === 'medica' ? quem.O : `A equipe (final ${numero.slice(-4)})`
}

function notaDaResposta(quemFala: string, oQue: string, envio: { ok: true } | { ok: false; erro: string } | null): string {
  const base = `🩺 ${quemFala} respondeu ao aviso pelo WhatsApp: ${oQue}`
  if (!envio || envio.ok) return base
  return `${base} ⚠️ A mensagem NÃO chegou ao paciente: ${envio.erro}. Responda por aqui.`
}

const TESTE = '✅ Era um aviso de teste: nada foi enviado.'
const motivoDo = (a: Alerta): MotivoDoAlerta => (a.motivo === 'urgencia' ? 'urgencia' : 'pedido')
const NAO_CHEGOU = (erro: string) => `⚠️ Não consegui enviar: ${erro}. Responda pela Central.`

/**
 * Trata a mensagem se ela for resposta a um aviso. Devolve true quando tratou
 * (o webhook nao passa a mensagem ao robo do paciente).
 */
export async function tratarRespostaDaEquipe(amb: AmbienteDaResposta, numero: string, m: MensagemRecebida): Promise<boolean> {
  const papel = papelDoNumero(numero, amb.numeros)
  if (!papel) return false
  const r = lerRespostaDaEquipe(m)
  if (!r) return false
  const recentes = await alertasRecentes(amb)
  if (recentes === null) return false

  const quem = quemAtende(amb.clinicId)
  const quemFala = quemRespondeu(papel, numero, quem)
  const agoraIso = amb.agora.toISOString()
  const responder = (texto: string, botoes?: { id: string; titulo: string }[]) =>
    amb.enviarWhatsApp(numero, montarConteudo(texto, botoes ? { botoes } : undefined))
  const nomeDoPaciente = (a: Alerta) => a.quem?.trim() || 'o paciente'
  const primeiroNome = (a: Alerta) => primeiroNomeUtil(a.quem) ?? nomeDoPaciente(a)

  if (r.tipo === 'veredito' || r.tipo === 'confirmacao') {
    const alerta = recentes.find((a) => a.id === r.alertaId) ?? (await alertaPorId(amb, r.alertaId))
    if (!alerta) {
      await responder('Não achei esse aviso. Se precisar, responda o paciente pela Central.')
      return true
    }
    if (alerta.teste) {
      await responder(TESTE)
      return true
    }

    if (r.tipo === 'veredito') {
      if (r.veredito === 'responde') {
        // Um toque so: dois toques seguidos nao mandam a frase duas vezes.
        const { data: marcados } = await amb.admin
          .from('alertas_de_urgencia')
          .update({ responde_em: agoraIso })
          .eq('id', alerta.id)
          .is('responde_em', null)
          .select('id')
        if (!marcados?.length) {
          await responder(`O "Eu respondo" deste aviso já foi enviado para ${nomeDoPaciente(alerta)}. Nada novo foi enviado.`)
          return true
        }
        const envio = await enviarParaOPaciente(amb, alerta, textoParaOPaciente('responde', papel, quem), false)
        if (envio.ok) {
          await primeiroVeredito(amb, alerta.id, 'responde', numero)
          await marcarRespondido(amb, alerta.id, numero)
        } else {
          // Nao chegou: o botao volta a valer, para tentar de novo.
          await amb.admin.from('alertas_de_urgencia').update({ responde_em: null }).eq('id', alerta.id)
        }
        await registrarResposta(
          amb,
          alerta,
          notaDaResposta(quemFala, `Eu respondo. O paciente foi avisado de que ${papel === 'medica' ? 'ela' : 'a equipe'} vai falar com ele por aqui.`, envio),
          `responde (${papel})${envio.ok ? '' : ' nao chegou'}`,
        )
        await responder(envio.ok ? `✅ Enviado para ${nomeDoPaciente(alerta)}.` : NAO_CHEGOU(envio.erro))
        return true
      }

      if (r.veredito === 'valores') {
        const valor = valorCadastrado(await carregarRespostas(amb.admin, amb.clinicId))
        if (!valor) {
          // Nada de inventar preco: sem a resposta pronta, nada sai, e quem
          // tocou fica sabendo o que falta.
          await registrarResposta(
            amb,
            alerta,
            `🩺 ${quemFala} tocou em Mandar os valores pelo WhatsApp, mas a resposta de valor não está cadastrada na Central (ou ainda tem "___"). ⚠️ Nada foi enviado ao paciente.`,
            `valores (${papel}) sem resposta de valor`,
          )
          await responder('⚠️ A resposta de valor não está cadastrada na Central (Preferências, Respostas prontas: um assunto com "valor", sem "___" no texto). Nada foi enviado ao paciente.')
          return true
        }
        const { data: marcados } = await amb.admin
          .from('alertas_de_urgencia')
          .update({ valores_em: agoraIso })
          .eq('id', alerta.id)
          .is('valores_em', null)
          .select('id')
        if (!marcados?.length) {
          await responder(`Os valores deste aviso já foram enviados para ${nomeDoPaciente(alerta)}. Nada novo foi enviado.`)
          return true
        }
        const envio = await enviarParaOPaciente(amb, alerta, valor, true)
        if (envio.ok) {
          await primeiroVeredito(amb, alerta.id, 'valores', numero)
          await marcarRespondido(amb, alerta.id, numero)
        } else {
          await amb.admin.from('alertas_de_urgencia').update({ valores_em: null }).eq('id', alerta.id)
        }
        await registrarResposta(
          amb,
          alerta,
          notaDaResposta(quemFala, 'Mandar os valores. O paciente recebeu a resposta pronta de valor.', envio),
          `valores (${papel})${envio.ok ? '' : ' nao chegou'}`,
        )
        await responder(envio.ok ? `✅ Enviado para ${nomeDoPaciente(alerta)}.` : NAO_CHEGOU(envio.erro))
        return true
      }

      // 'urgente' e 'aguardar' sao da urgencia, que ainda nao existe aqui.
      await responder('Esse botão não vale para este aviso. Se precisar, responda o paciente pela Central.')
      return true
    }

    // Confirmacao do texto.
    if (r.acao === 'cancelar') {
      await amb.admin.from('alertas_de_urgencia').update({ rascunho: null, rascunho_de: null, rascunho_em: null }).eq('id', alerta.id)
      await responder('Cancelado: nada foi enviado ao paciente.')
      return true
    }
    const atual = (await alertaPorId(amb, alerta.id)) ?? alerta
    const velho = !atual.rascunho_em || amb.agora.getTime() - Date.parse(atual.rascunho_em) > JANELA_DO_AVISO_MS
    if (!atual.rascunho || velho) {
      await responder('Não achei a mensagem para enviar (ela vale por 6 horas). Escreva de novo, em cima do aviso.')
      return true
    }
    if (!atual.rascunho_de || !mesmoTelefone(atual.rascunho_de, numero)) {
      await responder('Essa mensagem foi escrita por outra pessoa: só ela pode confirmar o envio.')
      return true
    }
    // O rascunho sai antes do envio, e so se ainda estiver la: dois toques em
    // "Enviar" nao mandam a mesma mensagem duas vezes.
    const { data: limpos } = await amb.admin
      .from('alertas_de_urgencia')
      .update({ rascunho: null, rascunho_de: null, rascunho_em: null })
      .eq('id', atual.id)
      .not('rascunho', 'is', null)
      .select('id')
    if (!limpos?.length) {
      await responder('Essa mensagem já foi enviada ou cancelada.')
      return true
    }
    const envio = await enviarParaOPaciente(amb, atual, textoParaOPaciente('texto', papel, quem, atual.rascunho), false)
    if (envio.ok) {
      await primeiroVeredito(amb, atual.id, 'texto', numero)
      await marcarRespondido(amb, atual.id, numero)
    }
    await registrarResposta(amb, atual, notaDaResposta(quemFala, `"${atual.rascunho}"`, envio), `texto (${papel})${envio.ok ? '' : ' nao chegou'}`)
    await responder(envio.ok ? `✅ Enviado para ${nomeDoPaciente(atual)}.` : NAO_CHEGOU(envio.erro))
    return true
  }

  // Texto, "ok" ou arquivo: de qual aviso?
  const escolha = escolherAlerta(recentes, r.citado, amb.agora, await ultimaResposta(amb, numero))
  if (!escolha) return false
  if ('ambiguos' in escolha) {
    const nomes = escolha.ambiguos.map(nomeDoPaciente).join(', ')
    await responder(`Há ${escolha.ambiguos.length} avisos recentes (${nomes}). Para eu saber de qual paciente é, segure a mensagem do aviso certo e toque em Responder.`)
    return true
  }
  const alerta = escolha.alerta
  if (alerta.teste) {
    await responder(TESTE)
    return true
  }
  if (r.tipo === 'visto') {
    await registrarResposta(amb, alerta, `👀 ${quemFala} viu o aviso (respondeu pelo WhatsApp). Nada foi enviado ao paciente.`, `visto (${papel})`)
    await responder('👍 Anotado.')
    return true
  }
  if (r.tipo === 'midia') {
    await registrarResposta(amb, alerta, `🩺 ${quemFala} mandou áudio ou arquivo em resposta ao aviso. Por lá só passa texto: nada foi enviado ao paciente.`, `midia (${papel})`)
    await responder('Por aqui eu só consigo repassar texto ao paciente. Escreva a mensagem, ou mande o arquivo pela Central.')
    return true
  }

  const texto = r.texto
  if (texto.length > LIMITE_DO_TEXTO) {
    // Cortar calado mandaria meia mensagem em nome dela.
    await responder(`A mensagem passou de ${LIMITE_DO_TEXTO} letras e por aqui não cabe inteira. Divida em duas, ou responda pela Central.`)
    return true
  }
  await amb.admin
    .from('alertas_de_urgencia')
    .update({ rascunho: texto, rascunho_de: numero, rascunho_em: agoraIso })
    .eq('id', alerta.id)
  const como = papel === 'medica' ? `mensagem d${quem.o}` : 'mensagem da equipe do consultório'
  await responder(`Vou mandar para ${primeiroNome(alerta)}, como ${como}:\n\n"${texto}"\n\nConfirma?`, [
    { id: payloadDaConfirmacao(alerta.id, 'enviar', motivoDo(alerta)), titulo: 'Enviar' },
    { id: payloadDaConfirmacao(alerta.id, 'cancelar', motivoDo(alerta)), titulo: 'Cancelar' },
  ])
  return true
}
