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
