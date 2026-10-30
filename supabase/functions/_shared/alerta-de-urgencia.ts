import { postarNaMeta } from './meta-tentativa.ts'
import { quemAtende } from './quem-atende.ts'
import { paraEnvio } from './telefone-br.ts'
import { chaveDoWhatsApp } from './whatsapp-teste.ts'

/**
 * Aviso no WhatsApp pessoal da Dra. Patricia (28/10/2026).
 *
 * Pedido do Edu em 27/10/2026: quando alguem pede consulta ou visita em casa
 * pelo robo, a Dra. e avisada no celular dela, a qualquer hora, e responde o
 * paciente por la mesmo. O caso que puxou isto foi o de 19/10/2026: um
 * paciente pediu consulta pelo robo, a equipe confirmou o horario a mao e
 * ninguem falou de valor nem de particular. O pedido estava na Central, mas
 * nao com quem decide - com a agenda por pedido, e a Dra. que confirma cada
 * horario.
 *
 * Porte do alerta de urgencia do sistema do Dr. Marcello (17/10/2026), com o
 * mesmo nome de arquivo, de tabela (alertas_de_urgencia) e de coluna
 * (clinic_settings.alerta_urgencia_telefones), para os proximos portes caberem.
 * La o motivo e a urgencia; aqui, por enquanto, so o pedido. O motivo
 * 'urgencia' ja tem lugar no codigo (DO_MOTIVO), mas nada o dispara.
 *
 * O envio e por modelo aprovado da Meta, categoria Utilidade: fora da janela
 * de 24 horas a Meta nao aceita texto livre, e a Dra. quase nunca escreveu para
 * o numero do consultorio no dia. Com botoes (aviso_pedido_consulta) quando da;
 * se o modelo com botoes ainda nao foi aprovado, cai sozinho no sem botoes
 * (aviso_pedido_consulta_simples), e o resto da lista ja vai direto por ele.
 *
 * O paciente SEMPRE recebe primeiro a resposta do robo. O aviso roda depois,
 * em segundo plano, e nada aqui derruba o webhook.
 *
 * Falha nao pode ser silenciosa (o lembrete da vespera ficou tres semanas
 * parado sem um erro em lugar nenhum): todo envio vira nota interna na
 * conversa, e o que nao chegou a ninguem tambem vira notificacao no celular da
 * equipe.
 */

export type MotivoDoAlerta = 'pedido' | 'urgencia' | 'duvida'
/** O que o toque num botao do aviso pede. 'urgente' e 'aguardar' sao da urgencia, que ainda nao vem. */
export type Veredito = 'responde' | 'valores' | 'urgente' | 'aguardar'

export const MODELO_DO_PEDIDO = 'aviso_pedido_consulta'
export const MODELO_DO_PEDIDO_SIMPLES = 'aviso_pedido_consulta_simples'
export const MODELO_DA_DUVIDA = 'aviso_duvida_paciente'

/** Os botoes do modelo, na ordem cadastrada na Meta. */
export const BOTOES_DO_PEDIDO: { veredito: Veredito; titulo: string }[] = [
  { veredito: 'responde', titulo: 'Eu respondo' },
  { veredito: 'valores', titulo: 'Mandar os valores' },
]

type ModelosDoMotivo = {
  /** Nulo: este aviso so tem o modelo sem botoes. */
  comBotoes: string | null
  semBotoes: string
  botoes: { veredito: Veredito; titulo: string }[]
  /** Como a nota chama o aviso: "aviso do pedido". */
  nome: string
}

/**
 * Os modelos de cada motivo. A urgencia entra aqui quando vier o porte dela
 * (na origem: alerta_urgencia_v2 com botoes e alerta_urgencia sem). Motivo sem
 * modelo nao sai, e o log diz.
 */
const DO_MOTIVO: Partial<Record<MotivoDoAlerta, ModelosDoMotivo>> = {
  pedido: { comBotoes: MODELO_DO_PEDIDO, semBotoes: MODELO_DO_PEDIDO_SIMPLES, botoes: BOTOES_DO_PEDIDO, nome: 'aviso do pedido' },
  // Um modelo so, sem botoes, de proposito: a resposta a uma duvida e sempre
  // escrita, e um modelo a menos e menos tempo esperando a analise da Meta.
  duvida: { comBotoes: null, semBotoes: MODELO_DA_DUVIDA, botoes: [], nome: 'aviso da dúvida' },
}

/**
 * O que volta no webhook quando a Dra. toca: qual aviso e qual botao. O
 * prefixo separa o pedido (PED) da urgencia (URG), que tera botoes proprios.
 */
export const payloadDoVeredito = (alertaId: string, veredito: Veredito, motivo: MotivoDoAlerta = 'pedido') =>
  `${motivo === 'urgencia' ? 'URG' : 'PED'}:${alertaId}:${veredito}`

/** Os motivos de atencao do robo que viram aviso: pedido de consulta e de visita. */
export const MOTIVOS_DO_PEDIDO = ['pedido_consulta', 'visita'] as const

/**
 * Avisar agora? 'novo' quando a conversa ENTRA no pedido (antes nao estava
 * acesa com ele). Quem continua escrevendo depois do pedido nao dispara outro
 * aviso a cada mensagem: so o fim do pedido (registrarPedidoDeConsulta e
 * registrarVisita) devolve o motivo, e a Dra. ja foi avisada. Pedido novo
 * depois de a equipe resolver o anterior (bandeira apagada) e 'novo' de novo.
 *
 * 'repetido': a pessoa refez o pedido inteiro com a conversa ainda acesa pelo
 * mesmo motivo. Sai so se nao houve aviso desta conversa nas ultimas 48 horas
 * (a espera do pedido, ver ESPERA_LONGA no webhook): sem isto, o pedido refeito
 * dias depois, com a bandeira do primeiro acesa porque ninguem abriu a
 * conversa, nunca chegaria ao celular dela.
 */
export function deveAvisarPedido(e: {
  atencaoAntes: boolean
  motivoAntes: string | null
  atencaoAgora: string | null | undefined
}): 'novo' | 'repetido' | null {
  if (!e.atencaoAgora || !(MOTIVOS_DO_PEDIDO as readonly string[]).includes(e.atencaoAgora)) return null
  return e.atencaoAntes && e.motivoAntes === e.atencaoAgora ? 'repetido' : 'novo'
}

/**
 * O motivo que decide o aviso do pedido (28/10/2026, com o atendente com IA).
 * O pedido anotado pelo robo manda o aviso mesmo quando a mesma mensagem trocou
 * a etiqueta da conversa: a IA responde uma duvida junto do ultimo passo e
 * chama a equipe, ou a mensagem traz um sinal de urgencia. Sem isto o pedido
 * entrava na Central e a Dra. nao ficava sabendo - o caso de 19/10/2026 de novo.
 */
export function motivoDoAvisoDoPedido(r: { atencao?: string | null; pedido?: { tipo?: string } | null } | null | undefined): string | null {
  if (r?.pedido) return r.pedido.tipo === 'visita' ? 'visita' : 'pedido_consulta'
  return r?.atencao ?? null
}

/**
 * Duvida que o robo e a IA nao resolvem (30/10/2026). Pedido do Edu: alem do
 * pedido de consulta, o numero do robo avisa o celular da Dra. e o dele quando a
 * conversa precisa de gente. Ate aqui isso so acendia a Central, que ela nao
 * fica olhando. Urgencia entra junto: e o caso mais forte de "o robo nao resolve".
 *
 * 'documento' fica de fora: 2a via e passo do robo, com a equipe na Central. O
 * pedido tem o aviso dele (ver motivoDoAvisoDoPedido), e quem chama nao manda os dois.
 */
export const MOTIVOS_DA_DUVIDA = ['atendente', 'urgencia'] as const

export function deveAvisarDuvida(e: {
  atencaoAntes: boolean
  motivoAntes: string | null
  atencaoAgora: string | null | undefined
}): 'novo' | 'repetido' | null {
  if (!e.atencaoAgora || !(MOTIVOS_DA_DUVIDA as readonly string[]).includes(e.atencaoAgora)) return null
  return e.atencaoAntes && e.motivoAntes === e.atencaoAgora ? 'repetido' : 'novo'
}

const PREFIXO_DO_RESUMO = /^\S*\s*Resumo da IA para a equipe:\s*/

/** O resumo que a IA deixou para a equipe, sem o rotulo da nota interna. */
export function resumoDaIA(nota: string | null | undefined): string | null {
  const texto = String(nota ?? '')
  if (!PREFIXO_DO_RESUMO.test(texto)) return null
  return texto.replace(PREFIXO_DO_RESUMO, '').trim() || null
}

/**
 * A duvida numa frase, para o {{3}}: o resumo da IA quando ela deixou um; sem
 * ele (robo de regras, IA fora do ar), o que a pessoa escreveu. Mensagem sem
 * texto nao pode virar parametro vazio, que a Meta recusa.
 */
export function resumoDaDuvida(e: { urgente?: boolean; nota?: string | null; texto?: string | null }): string {
  const base = resumoDaIA(e.nota) || String(e.texto ?? '').trim() || 'Pediu para falar com a equipe'
  return e.urgente ? `URGENTE: ${base}` : base
}

/** A espera do pedido: a mesma das 48 horas do webhook e de liberar_conversas_travadas. */
export const ESPERA_DO_PEDIDO_MS = 48 * 3600 * 1000
/**
 * Na duvida, a janela em que a resposta dela vale sem citar o aviso. Quem manda
 * cinco mensagens seguidas com a conversa acesa nao toca o celular cinco vezes.
 */
export const ESPERA_DA_DUVIDA_MS = 6 * 3600 * 1000

/**
 * Houve aviso desta conversa nas ultimas 48 horas, que nao tenha falhado? O
 * que falhou nao conta: a Dra. nao foi avisada, e o pedido refeito e a nova
 * chance. Na duvida (tabela fora, erro), diz que nao: pedido refeito e raro, e
 * um aviso a mais custa menos que um pedido sem aviso.
 */
export async function avisoRecente(admin: Admin, clinicId: string, conversa: string, agora: Date, motivo: MotivoDoAlerta = 'pedido'): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('alertas_de_urgencia')
      .select('id,resultado')
      .eq('clinic_id', clinicId)
      .eq('conversa_whatsapp', conversa)
      .eq('motivo', motivo)
      .gte('criado_em', new Date(agora.getTime() - (motivo === 'duvida' ? ESPERA_DA_DUVIDA_MS : ESPERA_DO_PEDIDO_MS)).toISOString())
      .limit(10)
    if (error) throw error
    return ((data ?? []) as { resultado?: string | null }[]).some((a) => !String(a.resultado ?? '').startsWith('falhou'))
  } catch (erro) {
    console.warn('Aviso no WhatsApp da Dra.: nao li os avisos recentes; o pedido refeito vai', erro)
    return false
  }
}

/** O pedido como o robo anotou (ver registrarPedidoDeConsulta e registrarVisita). */
export type DadosDoPedido = {
  tipo: 'consulta' | 'visita'
  /** Nome do paciente do pedido: o do cadastro, ou o que a pessoa escreveu. */
  paciente?: string | null
  /** "Primeira consulta" ou "Retorno". */
  consulta?: string
  unidade?: string
  /** Visita em casa: onde. */
  endereco?: string
  periodos?: string[]
  aPartir?: string
  restricao?: string
  /** Veio de "Preciso remarcar": ha outra consulta marcada. */
  substitui?: boolean
}

/**
 * O pedido numa frase, para o {{3}} do aviso. Sai dos dados, e nao da mensagem
 * ao paciente, que tem emoji, quebra de linha e o telefone do consultorio.
 */
export function resumoDoPedido(d: DadosDoPedido): string {
  const partes: string[] = []
  if (d.tipo === 'visita') partes.push(d.endereco?.trim() ? `Visita em casa: ${d.endereco.trim()}` : 'Visita em casa')
  else partes.push([d.consulta?.trim() || 'Consulta', d.unidade?.trim()].filter(Boolean).join(', '))
  if (d.periodos?.length) partes.push(`Pode: ${d.periodos.join(' ou ')}`)
  if (d.aPartir?.trim()) partes.push(`A partir de: ${d.aPartir.trim()}`)
  partes.push(d.restricao?.trim() ? `Restrição: ${d.restricao.trim()}` : 'Sem restrição de dia ou horário')
  if (d.substitui) partes.push('No lugar de uma consulta já marcada')
  return partes.map((p) => p.replace(/[\s.]+$/, '')).join('. ') + '.'
}

/**
 * Quem pediu, para o {{1}}: o paciente do pedido; sem ele, o nome do perfil do
 * WhatsApp; sem nenhum, o unico paciente do telefone. Sem nome nenhum, so o
 * final do telefone: o numero inteiro nao vai para fora (LGPD), e o final
 * basta para achar a conversa na Central.
 */
export function quemDoPedido(e: { paciente?: string | null; nomeDoPerfil?: string | null; pacientes?: { name: string }[]; telefone?: string }): string {
  const paciente = String(e.paciente ?? '').trim()
  if (paciente) return paciente
  const perfil = String(e.nomeDoPerfil ?? '').trim()
  if (perfil) return perfil
  if (e.pacientes?.length === 1 && e.pacientes[0].name.trim()) return e.pacientes[0].name.trim()
  const d = String(e.telefone ?? '').replace(/\D/g, '')
  return d.length >= 4 ? `Contato final ${d.slice(-4)}` : 'Paciente'
}

/**
 * CPF, e-mail e telefone saem antes de ir para fora (LGPD). A Dra. precisa
 * saber o que foi pedido; o resto esta na Central. A restricao e o "a partir
 * de" sao texto livre do paciente, e la cabe um "me liga no 13 9...".
 */
export function semDadosPessoais(texto: string): string {
  return String(texto ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, '[telefone]')
}

/**
 * Parametro de modelo nao pode ter quebra de linha, tabulacao nem quatro
 * espacos seguidos (a Meta recusa o envio inteiro), nem ficar vazio.
 */
function parametro(texto: string, limite: number): string {
  const limpo = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (!limpo) return '-'
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo
}

export function horaDeBrasilia(agora: Date): string {
  return agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

/** Os tres parametros do aviso: quem, a hora e o resumo do pedido. */
export function parametrosDoAviso(e: { quem: string; resumo: string; agora: Date }): string[] {
  return [parametro(semDadosPessoais(e.quem), 60), horaDeBrasilia(e.agora), parametro(semDadosPessoais(e.resumo), 300)]
}

// Coluna e tabela novas: lidas em consulta separada, com try/catch.
type Admin = { from: (tabela: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Os numeros do aviso, prontos para a Meta: 55 + DDD + celular com o 9. Aceita
 * a lista do banco ou o texto da tela (um por linha, ou separados por
 * virgula). Numero que nao fecha 12 ou 13 digitos fica de fora: melhor um
 * aviso a menos do que um erro da Meta que esconde os outros. A ordem fica: o
 * primeiro e o da Dra.
 */
export function numerosDoAlerta(valor: unknown): string[] {
  const brutos = Array.isArray(valor) ? valor.map(String) : String(valor ?? '').split(/[\n,;]+/)
  const vistos = new Set<string>()
  for (const bruto of brutos) {
    const digitos = bruto.replace(/\D/g, '')
    if (digitos.length < 10) continue
    const numero = paraEnvio(digitos)
    if (numero.length === 12 || numero.length === 13) vistos.add(numero)
  }
  return [...vistos]
}

/**
 * Os numeros salvos em Preferencias. null quando nao deu para ler (banco sem a
 * coluna, migration que nao chegou): quem chama grita. Lista vazia e escolha
 * da clinica: o aviso esta desligado.
 */
export async function lerNumeros(admin: Admin, clinicId: string): Promise<string[] | null> {
  try {
    const { data, error } = await admin.from('clinic_settings').select('alerta_urgencia_telefones').eq('clinic_id', clinicId).maybeSingle()
    if (error) throw error
    return numerosDoAlerta((data as { alerta_urgencia_telefones?: unknown } | null)?.alerta_urgencia_telefones)
  } catch (erro) {
    console.error('Aviso no WhatsApp da Dra.: sem clinic_settings.alerta_urgencia_telefones (migration 20261028100000 aplicada?)', erro)
    return null
  }
}

/**
 * Erros em que o modelo com botoes nao serve e o sem botoes ainda pode servir:
 * 132001 nao existe (ou ainda em analise) nesse idioma; 132000 e 132012
 * parametros que nao batem (aprovado sem os botoes); 132015 e 132016 pausado
 * ou desativado pela Meta.
 */
const MODELO_RECUSADO = [132000, 132001, 132012, 132015, 132016]
function modeloRecusado(corpo: { error?: { code?: number; message?: string } } | null): boolean {
  return MODELO_RECUSADO.includes(Number(corpo?.error?.code)) || /template name does not exist|does not exist in/i.test(String(corpo?.error?.message ?? ''))
}
const naoAprovado = (erro: string) => /132001|template name does not exist|does not exist in/i.test(erro)

export type EnvioDoAlerta = { numero: string; ok: boolean; erro?: string; semBotoes?: boolean }

const final = (numero: string) => `final ${numero.slice(-4)}`

/**
 * O que fica registrado: o detalhe curto (evento e coluna resultado, ate 120
 * caracteres) e a nota que a equipe le na conversa. envios[0] e sempre o
 * celular da Dra.: a lista vem na ordem salva.
 */
export function descreverEnvio(
  envios: EnvioDoAlerta[],
  opcoes: { motivo?: MotivoDoAlerta; teste?: boolean } = {},
): { detalhe: string; nota: string; falhou: boolean } {
  const modelos = DO_MOTIVO[opcoes.motivo ?? 'pedido'] ?? DO_MOTIVO.pedido!
  const quem = quemAtende()
  const daDra = (numero: string) => (envios[0]?.numero === numero ? `${final(numero)} (${quem.o.replace(/^a /, '')})` : final(numero))
  const certos = envios.filter((e) => e.ok)
  const errados = envios.filter((e) => !e.ok)
  // Modelo sem versao com botoes nao "caiu na reserva": e o aviso normal.
  const semBotoes = Boolean(modelos.comBotoes) && certos.some((e) => e.semBotoes)
  const aviso = opcoes.teste ? 'Aviso de teste' : `A${modelos.nome.slice(1)}`
  const reserva = semBotoes
    ? ` Foi sem os botões: o modelo ${modelos.comBotoes} ainda não foi aprovado na Meta, e para responder ela escreve em cima do aviso.`
    : ''

  if (!errados.length) {
    const outros = certos.slice(1).map((e) => final(e.numero))
    return {
      detalhe: `enviado ${certos.length}/${envios.length}${semBotoes ? ' sem botoes' : ''}`,
      nota: `📱 ${aviso} enviado para o WhatsApp d${quem.o}${outros.length ? ` e para ${outros.join(', ')}` : ''}.${reserva}`,
      falhou: false,
    }
  }
  const motivo = errados[0].erro ?? 'sem detalhe'
  const explicacao = naoAprovado(motivo) ? `o modelo ${modelos.semBotoes} ainda não foi aprovado na Meta` : motivo
  const draFicouSem = !envios[0]?.ok
  return {
    detalhe: `falhou ${errados.length}/${envios.length}: ${motivo}`.slice(0, 120),
    nota:
      `⚠️ O ${opcoes.teste ? 'aviso de teste' : modelos.nome} NÃO chegou ao celular ${errados.map((e) => daDra(e.numero)).join(', ')}: ${explicacao}.` +
      (draFicouSem ? ` Avise ${quem.o} por telefone.` : '') +
      (certos.length ? ` Chegou a ${certos.map((e) => daDra(e.numero)).join(', ')}.${reserva}` : ''),
    falhou: true,
  }
}

export type PedidoDeAlerta = {
  /** 'pedido' ou 'duvida'. 'urgencia' ainda sem modelo proprio: urgencia sai como duvida. */
  motivo: MotivoDoAlerta
  clinicId: string
  quem: string
  /** O pedido numa frase (ver resumoDoPedido). */
  resumo: string
  agora: Date
  /** Onde fica a nota. Sem conversa, e o aviso de teste da tela. */
  conversaWhatsApp?: string
  /** Para o teste da tela: os numeros ja lidos. */
  numeros?: string[]
  /** O pedido foi refeito com a conversa ainda acesa: so sai sem aviso recente (ver deveAvisarPedido). */
  repetido?: boolean
  /**
   * Notificacao no celular da equipe quando o aviso nao chegou a ninguem. O
   * webhook passa avisarEquipe (push-da-equipe.ts); fora dele, nada.
   */
  reserva?: (titulo: string, corpo: string) => Promise<unknown>
}

async function registrarAlerta(admin: Admin, p: PedidoDeAlerta): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('alertas_de_urgencia')
      .insert({
        clinic_id: p.clinicId,
        motivo: p.motivo,
        canal: 'WhatsApp',
        conversa_whatsapp: p.conversaWhatsApp ?? null,
        teste: !p.conversaWhatsApp,
        quem: String(p.quem ?? '').slice(0, 120),
      })
      .select('id')
      .single()
    if (error) throw error
    return (data as { id: string }).id
  } catch (erro) {
    console.error('Aviso no WhatsApp da Dra.: nao registrei o aviso; vai sem botoes de resposta', erro)
    return null
  }
}

/** Nota interna na conversa do paciente. Cada registro no seu try: perder a nota nao custa o resto. */
export async function gravarNota(admin: Admin, clinicId: string, conversa: string | null | undefined, texto: string) {
  if (!conversa || !texto.trim()) return
  try {
    const { error } = await admin.from('conversation_notes').insert({ clinic_id: clinicId, conversation_id: conversa, texto: texto.slice(0, 4000) })
    if (error) console.error('Aviso no WhatsApp da Dra.: nota nao gravada', error)
  } catch (erro) {
    console.error('Aviso no WhatsApp da Dra.: nota nao gravada', erro)
  }
}

async function gritarNaReserva(p: PedidoDeAlerta, corpo: string) {
  if (!p.reserva) return
  try {
    await p.reserva('⚠️ O aviso não chegou ao WhatsApp da Dra.', corpo.slice(0, 140))
  } catch (erro) {
    console.error('Aviso no WhatsApp da Dra.: nem a notificacao de reserva saiu', erro)
  }
}

/**
 * Manda o aviso para cada numero e registra o resultado. Nunca lanca: quem
 * chama e o webhook, depois de o paciente ja ter recebido a resposta.
 */
export async function enviarAviso(admin: Admin, p: PedidoDeAlerta, buscar: typeof fetch = fetch): Promise<EnvioDoAlerta[]> {
  const quem = quemAtende(p.clinicId)
  try {
    const modelos = DO_MOTIVO[p.motivo]
    if (!modelos) {
      console.error(`Aviso no WhatsApp: o motivo ${p.motivo} ainda nao tem modelo; nada sai`)
      return []
    }
    if (p.repetido && p.conversaWhatsApp && (await avisoRecente(admin, p.clinicId, p.conversaWhatsApp, p.agora, p.motivo))) {
      console.info(`Aviso no WhatsApp da Dra.: ${modelos.nome} repetido com aviso recente; nao repete`)
      return []
    }
    const lidos = p.numeros ?? (await lerNumeros(admin, p.clinicId))
    if (lidos === null) {
      const nota = `⚠️ O ${modelos.nome} não foi para o WhatsApp d${quem.o}: a atualização do banco ainda não chegou. Avise ${quem.o} por telefone.`
      await gravarNota(admin, p.clinicId, p.conversaWhatsApp, nota)
      await gritarNaReserva(p, `${p.quem}: a atualização do banco ainda não chegou. Avise ${quem.o} por telefone.`)
      return []
    }
    const numeros = numerosDoAlerta(lidos)
    if (!numeros.length) {
      console.info('Aviso no WhatsApp da Dra.: nenhum numero salvo em Preferencias; aviso desligado')
      return []
    }

    const { data: ajustes, error: erroDosAjustes } = await admin
      .from('clinic_settings')
      .select('whatsapp_phone_number_id,whatsapp_template_language')
      .eq('clinic_id', p.clinicId)
      .maybeSingle()
    if (erroDosAjustes) console.error('Aviso no WhatsApp da Dra.: nao li o clinic_settings', erroDosAjustes)
    const numeroDoRobo = (ajustes as { whatsapp_phone_number_id?: string } | null)?.whatsapp_phone_number_id
    const token = chaveDoWhatsApp(numeroDoRobo)
    const versao = (typeof Deno !== 'undefined' ? Deno.env.get('META_GRAPH_VERSION')?.trim() : '') || 'v25.0'
    const idioma = (ajustes as { whatsapp_template_language?: string } | null)?.whatsapp_template_language || 'pt_BR'
    const corpoDoModelo = { type: 'body', parameters: parametrosDoAviso(p).map((text) => ({ type: 'text', text })) }

    // O aviso fica registrado antes de sair: e o id dele que vai nos botoes.
    // Sem a tabela, sai sem botoes - a Dra. ainda responde escrevendo, mas
    // so na janela de 6 horas (ver resposta-ao-alerta.ts).
    const alertaId = await registrarAlerta(admin, p)
    let comBotoes = Boolean(alertaId && modelos.comBotoes)

    const modelo = (botoes: boolean) => ({
      type: 'template',
      template: botoes
        ? {
            name: modelos.comBotoes!,
            language: { code: idioma },
            components: [
              corpoDoModelo,
              ...modelos.botoes.map((b, i) => ({
                type: 'button',
                sub_type: 'quick_reply',
                index: String(i),
                parameters: [{ type: 'payload', payload: payloadDoVeredito(alertaId!, b.veredito, p.motivo) }],
              })),
            ],
          }
        : { name: modelos.semBotoes, language: { code: idioma }, components: [corpoDoModelo] },
    })
    const enviar = async (numero: string, botoes: boolean) => {
      // Erro passageiro da Meta tenta de novo (26/10/2026, ver meta-tentativa.ts).
      const resposta = await postarNaMeta(
        `https://graph.facebook.com/${versao}/${numeroDoRobo}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, ...modelo(botoes) }),
        },
        { buscar },
      )
      return { ok: resposta.ok, status: resposta.status, corpo: await resposta.json().catch(() => ({})) }
    }

    const envios: EnvioDoAlerta[] = []
    const mensagens: string[] = []
    for (const numero of numeros) {
      if (!numeroDoRobo || !token) {
        envios.push({ numero, ok: false, erro: 'WhatsApp da clínica sem número ou token no servidor' })
        continue
      }
      try {
        let r = await enviar(numero, comBotoes)
        if (!r.ok && comBotoes && modeloRecusado(r.corpo)) {
          console.warn(`Aviso no WhatsApp da Dra.: ${modelos.comBotoes} recusado (${r.corpo?.error?.code}); vai o ${modelos.semBotoes}`)
          comBotoes = false
          r = await enviar(numero, false)
        }
        if (r.ok) {
          envios.push({ numero, ok: true, semBotoes: !comBotoes })
          const id = r.corpo?.messages?.[0]?.id
          if (id) mensagens.push(String(id))
        } else {
          const codigo = r.corpo?.error?.code ? `(#${r.corpo.error.code}) ` : ''
          envios.push({ numero, ok: false, erro: `${codigo}${r.corpo?.error?.message ?? `HTTP ${r.status}`}` })
        }
      } catch (erro) {
        envios.push({ numero, ok: false, erro: String(erro).slice(0, 200) })
      }
    }

    const descrito = descreverEnvio(envios, { motivo: p.motivo, teste: !p.conversaWhatsApp })
    if (descrito.falhou) console.error('Aviso no WhatsApp da Dra. nao saiu para todos', descrito.detalhe)
    if (alertaId) {
      try {
        const { error } = await admin.from('alertas_de_urgencia').update({ mensagens, resultado: descrito.detalhe }).eq('id', alertaId)
        if (error) console.error('Aviso no WhatsApp da Dra.: ids das mensagens nao gravados', error)
      } catch (erro) {
        console.error('Aviso no WhatsApp da Dra.: ids das mensagens nao gravados', erro)
      }
    }

    await gravarNota(admin, p.clinicId, p.conversaWhatsApp, descrito.nota)
    if (p.conversaWhatsApp) {
      try {
        const { error } = await admin
          .from('whatsapp_bot_events')
          .insert({ clinic_id: p.clinicId, conversation_id: p.conversaWhatsApp, evento: p.motivo === 'duvida' ? 'aviso_duvida' : 'aviso_pedido', detalhe: descrito.detalhe })
        if (error) console.error('Aviso no WhatsApp da Dra.: evento nao gravado', error)
      } catch (erro) {
        console.error('Aviso no WhatsApp da Dra.: evento nao gravado', erro)
      }
    }
    if (!envios.some((e) => e.ok)) {
      await gritarNaReserva(p, `${p.quem}: ${envios[0]?.erro ?? 'sem detalhe'}. Avise ${quem.o} por telefone.`)
    }
    return envios
  } catch (erro) {
    console.error('Aviso no WhatsApp da Dra.: falhou antes de enviar', erro)
    await gravarNota(admin, p.clinicId, p.conversaWhatsApp, `⚠️ O ${DO_MOTIVO[p.motivo]?.nome ?? 'aviso'} não foi para o WhatsApp d${quem.o}: ${String(erro).slice(0, 200)}. Avise ${quem.o} por telefone.`)
    await gritarNaReserva(p, `${p.quem}: o aviso falhou antes de sair. Avise ${quem.o} por telefone.`)
    return []
  }
}
