import { postarNaMeta } from './meta-tentativa.ts'
import { textoDoModelo } from './modelos.ts'

/**
 * Lembrete de consulta: montar, mandar e repetir (07/11/2026, portado do
 * sistema do Dr. Marcello, onde nasceu em 29/10).
 *
 * Ate aqui o lembrete saia uma vez so, na vespera, e quem nao respondia ficava
 * "sem resposta" ate alguem ligar. La, em 29/10, uma familia nao respondeu o
 * das 09:20 (consulta no dia seguinte, 10:40), e a equipe nao tinha como
 * perguntar de novo pela Central: a janela de 24h estava fechada, e o unico
 * botao era o convite, que nao fala da consulta. Pedido do Edu: um botao para
 * repetir a confirmacao e, sem resposta, o proprio sistema perguntar ate 3
 * vezes no dia. Aqui pesa mais: paciente idoso le o WhatsApp uma vez no dia,
 * quando le.
 *
 * O envio mora aqui para os tres caminhos usarem o mesmo: o lembrete da
 * vespera e a repeticao (appointment-reminders, pelo cron) e o botao da
 * conversa (repetir-lembrete). Todos gravam a mensagem com appointment_id: e
 * por ela que o webhook acha a consulta quando a familia toca "Confirmar
 * presenca" (context.id), em qualquer uma das copias.
 */

/**
 * O {{4}} do modelo da Dra. ("Local: {{4}}"). Na telemedicina diz "virtual
 * (consulta por video)", e nao o nome da unidade que cedeu o horario - senao o
 * paciente sai de casa para uma consulta que era online. O resto e o nome da
 * unidade como esta na agenda ("Consultorio (Gonzaga)", "Visita domiciliar").
 * E o mesmo texto que appointment-reminders mandava antes de existir este
 * arquivo; o do Dr. Marcello acrescenta o endereco porque o modelo dele diz
 * "na unidade {{4}}".
 */
export function unidadeDoLembrete(modality: string | null | undefined, nome: string | null | undefined): string {
  if (modality === 'telemedicina') return 'virtual (consulta por vídeo)'
  return nome?.trim() || 'a clínica'
}

type Admin = { from: (tabela: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Quantas vezes o sistema pergunta, no maximo, contando o primeiro lembrete. */
export const LEMBRETES_POR_CONSULTA = 3

/**
 * Espaco entre um lembrete e o seguinte. Com o da manha as 09:20, as
 * repeticoes caem as 13:20 e as 17:20 (a ultima passada do dia e as 19:20).
 */
export const INTERVALO_ENTRE_LEMBRETES_MS = 4 * 3600 * 1000

/**
 * A passada roda aos :20 e o envio sai alguns segundos depois. Sem folga, o
 * lembrete das 09:20:05 ainda nao fez 4 horas na passada das 13:20:01, e a
 * repeticao escorregaria para as 14:20.
 */
const FOLGA_DA_PASSADA_MS = 15 * 60 * 1000

/** Idade minima do ultimo lembrete para o proximo sair. */
export const ESPERA_PARA_REPETIR_MS = INTERVALO_ENTRE_LEMBRETES_MS - FOLGA_DA_PASSADA_MS

/** Dois cliques seguidos, ou duas pessoas da equipe, nao mandam dois lembretes. */
export const ESPERA_ENTRE_CLIQUES_MS = 2 * 60 * 1000

export function formatarDataHora(iso: string, timezone: string) {
  const data = new Date(iso)
  const dataBR = data.toLocaleDateString('pt-BR', { timeZone: timezone })
  const hora = data.toLocaleTimeString('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
  return { dataBR, hora }
}

export type ConsultaDoLembrete = {
  starts_at: string
  modality?: string | null
  clinic_units?: { name?: string | null; address?: string | null } | null
}

/** Os quatro parametros do modelo aprovado: nome, data, hora e lugar (ver unidadeDoLembrete). */
export function parametrosDoLembrete(consulta: ConsultaDoLembrete, nome: string, timezone: string): string[] {
  const { dataBR, hora } = formatarDataHora(consulta.starts_at, timezone)
  const lugar = consulta.clinic_units ?? null
  return [nome, dataBR, hora, unidadeDoLembrete(consulta.modality, lugar?.name)]
}

export type HistoricoDoLembrete = {
  /** Lembretes desta consulta que ja sairam ou tentaram sair, do sistema ou da equipe. */
  envios: number
  /** Quando saiu o ultimo deles. */
  ultimoEnvio: string | null
  /** O paciente (ou a familia) escreveu alguma coisa na conversa depois do primeiro lembrete. */
  familiaEscreveu: boolean
}

/**
 * Pergunta de novo? So a regra. Quem chama ja trouxe so consulta marcada, sem
 * confirmacao nem pedido de remarcar, a mais de 2 horas de acontecer e no
 * horario das passadas (9h as 20h).
 *
 * Qualquer mensagem do paciente encerra: quem respondeu "ok", perguntou o
 * endereco ou mandou audio ja esta falando com a clinica, e o mesmo lembrete
 * por cima disso vira cobranca. Se confirmou com uma palavra que o robo nao
 * reconheceu, a equipe registra pelo "Ja confirmou" da conversa.
 *
 * Os lembretes que a equipe mandou pelo botao contam: o sistema completa ate
 * 3 perguntas, nao soma mais 3 as da recepcao. E envio recusado pela Meta
 * conta como tentativa, para um numero que nao recebe nao ser tentado a cada
 * passada.
 */
export function repetirOLembrete(h: HistoricoDoLembrete, agora = Date.now()): { repetir: boolean; motivo: string } {
  if (h.familiaEscreveu) return { repetir: false, motivo: 'a familia escreveu depois do lembrete' }
  if (h.envios >= LEMBRETES_POR_CONSULTA) return { repetir: false, motivo: `ja foram ${h.envios} lembretes` }
  if (!h.ultimoEnvio) return { repetir: false, motivo: 'sem lembrete anterior' }
  const desde = agora - new Date(h.ultimoEnvio).getTime()
  // Data ilegivel da NaN, e NaN nao passa: na duvida, nao manda.
  if (!(desde >= ESPERA_PARA_REPETIR_MS)) return { repetir: false, motivo: 'ultimo lembrete ha menos de 4 horas' }
  return { repetir: true, motivo: 'sem resposta' }
}

/**
 * Lembrete para quem acabou de marcar: espera o meio do caminho (porte de
 * 20/11/2026 do sistema do Dr. Marcello, onde entrou em 13/11).
 *
 * La, uma mae marcou as 18h14 uma consulta para o dia seguinte, 14h30, e as
 * 18h20 o robo perguntou "podemos confirmar sua presenca?". O Edu: "se ele
 * acabou de marcar e esta pedindo confirmacao, nao faz sentido... ele vai
 * avisar quando faltar metade do tempo para a consulta acontecer". Aqui o caso
 * e o mesmo: a Dra. confirma o pedido e, minutos depois, sairia o lembrete.
 *
 * A regra: o primeiro lembrete so sai depois da metade do tempo entre a hora
 * em que a consulta foi marcada e a hora dela. Quem marcou ha uma semana ja
 * passou da metade na vespera, e nada muda para ele.
 *
 * So espera quando ainda vai existir uma passada boa depois da metade: dentro
 * do horario das passadas (9h as 20h) e com a antecedencia minima da consulta.
 * Quem marca as 17h para as 9h de amanha tem a metade a 1h da manha, e a
 * passada seguinte (9h20) ja seria tarde: esse recebe agora. Esperar nunca
 * pode custar o lembrete.
 *
 * `agora` e o instante de uma passada; as proximas sao de hora em hora.
 */
export function esperarOMeioDoCaminho(
  c: { marcadaEm: string | null | undefined; comecaEm: string },
  agora: number,
  timezone: string,
  passadas: { horaInicial: number; horaFinal: number; antecedenciaMinimaHoras: number },
): boolean {
  const marcada = Date.parse(String(c.marcadaEm ?? ''))
  const comeca = Date.parse(c.comecaEm)
  // Data ilegivel: na duvida, o lembrete sai como sempre saiu.
  if (!Number.isFinite(marcada) || !Number.isFinite(comeca) || comeca <= marcada) return false
  const meio = marcada + (comeca - marcada) / 2
  if (agora >= meio) return false
  const HORA = 3600 * 1000
  const ultima = comeca - passadas.antecedenciaMinimaHoras * HORA
  for (let t = agora + HORA; t <= ultima; t += HORA) {
    if (t < meio) continue
    const hora = Number(new Date(t).toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false })) % 24
    if (hora >= passadas.horaInicial && hora < passadas.horaFinal) return true
  }
  return false
}

/**
 * Acabou de marcar: o lembrete nao sai na primeira meia hora (porte de
 * 20/11/2026 do sistema do Dr. Marcello, onde entrou em 17/11).
 *
 * La, a familia remarcou as 14h18 para as 17h20 do mesmo dia e, as 14h20, no
 * meio das perguntas do cadastro, chegou "podemos confirmar sua presenca?".
 * Ela respondeu "Confirma" a pergunta errada. O meio do caminho (acima) nao
 * segurava esse caso de proposito: com a consulta tao perto, esperar a metade
 * custaria o lembrete. Meia hora nao custa: a proxima passada e daqui a uma
 * hora, e quem marcou ha dois minutos sabe que marcou.
 *
 * O preco, assumido: quem marca a menos de duas horas e meia da consulta pode
 * ficar sem lembrete nenhum (a passada seguinte ja cai dentro da antecedencia
 * minima). E alguem que acabou de escolher o horario.
 */
export const ESPERA_DEPOIS_DE_MARCAR_MS = 30 * 60 * 1000
export function acabouDeMarcar(marcadaEm: string | null | undefined, agora: number): boolean {
  const marcada = Date.parse(String(marcadaEm ?? ''))
  // Data ilegivel ou no futuro: na duvida, o lembrete sai como sempre saiu.
  if (!Number.isFinite(marcada) || agora < marcada) return false
  return agora - marcada < ESPERA_DEPOIS_DE_MARCAR_MS
}

export type EnvioDoLembrete = {
  clinicId: string
  conversationId: string
  patientId: string | null
  appointmentId: string
  waId: string
  phoneNumberId: string
  token: string
  graphVersion: string
  modelo: string
  idioma: string
  parametros: string[]
  /** Sistema (vespera ou repeticao) ou equipe (botao da conversa). */
  automatico: boolean
}

export type ResultadoDoLembrete =
  | { ok: true; quando: string; externalId: string | null; registrado: boolean }
  | { ok: false; quando: string; motivo: string; naoAprovado: boolean }

/**
 * Manda o modelo do lembrete e grava na conversa o que a familia leu.
 *
 * A recusa da Meta tambem fica na conversa, como mensagem "falhou" com o
 * motivo: barulho para a equipe, e nao um lembrete que so nao chegou. O que
 * fazer com a consulta (reminder_sent_at, reminder_failed_at) fica com quem
 * chamou, porque cada caminho tem a sua regra.
 */
export async function mandarLembrete(
  admin: Admin,
  e: EnvioDoLembrete,
  opcoes: { buscar?: typeof fetch; agora?: () => Date } = {},
): Promise<ResultadoDoLembrete> {
  const quando = (opcoes.agora?.() ?? new Date()).toISOString()
  const resposta = await postarNaMeta(
    `https://graph.facebook.com/${e.graphVersion}/${e.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: e.waId,
        type: 'template',
        template: {
          name: e.modelo,
          language: { code: e.idioma },
          components: [{ type: 'body', parameters: e.parametros.map((text) => ({ type: 'text', text })) }],
        },
      }),
    },
    { buscar: opcoes.buscar },
  )
  const corpo = await resposta.json().catch(() => ({}))

  // A conversa guarda o que o paciente leu, para bater com o celular dele.
  const [nome, dataBR, hora, unidade] = e.parametros
  const texto =
    textoDoModelo(e.modelo, e.parametros) ??
    `Lembrete de consulta em ${dataBR} às ${hora} (${unidade}) enviado para ${nome}.`
  const mensagem = {
    clinic_id: e.clinicId,
    conversation_id: e.conversationId,
    patient_id: e.patientId,
    appointment_id: e.appointmentId,
    direction: 'outbound',
    automatic: e.automatico,
    message_type: 'template',
    template_name: e.modelo,
    body: texto,
  }

  if (!resposta.ok) {
    const motivo = corpo?.error?.message || 'Meta recusou o envio.'
    const { error } = await admin
      .from('whatsapp_messages')
      .insert({ ...mensagem, status: 'failed', failed_at: quando, failure_reason: motivo })
    if (error) console.error('Lembrete recusado pela Meta e nao registrado na conversa', error)
    // 132001: modelo inexistente ou ainda nao aprovado naquele idioma.
    return { ok: false, quando, motivo, naoAprovado: corpo?.error?.code === 132001 }
  }

  const externalId: string | null = corpo?.messages?.[0]?.id ?? null
  const { error } = await admin
    .from('whatsapp_messages')
    .insert({ ...mensagem, external_message_id: externalId, status: 'accepted', sent_at: quando })
  // Saiu, mas sem o registro o toque em "Confirmar presenca" desta copia nao
  // acha a consulta pelo context.id (vale a anterior). Grita.
  if (error) console.error('Lembrete saiu mas nao foi registrado na conversa', error)
  return { ok: true, quando, externalId, registrado: !error }
}
