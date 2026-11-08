import { adminClient, corsHeaders, json, toBrazilE164 } from '../_shared/whatsapp.ts'
import { cadastrarDaFicha } from '../_shared/cadastro.ts'
import { janelaDeLembrete } from '../_shared/lembrete.ts'
import {
  ESPERA_PARA_REPETIR_MS,
  mandarLembrete,
  parametrosDoLembrete,
  repetirOLembrete,
} from '../_shared/lembrete-envio.ts'
import { variantesDoTelefone } from '../_shared/telefone-br.ts'
import { chaveDoWhatsApp, foraDaListaDeTeste, listaDeTeste } from '../_shared/whatsapp-teste.ts'
import { retomarConversasDoInstagram } from '../_shared/instagram.ts'

/**
 * Lembrete automatico de consulta.
 *
 * Roda de hora em hora pelo pg_cron (aos :20, das 9h as 20h no fuso da clinica)
 * e avisa quem tem consulta ate o fim do dia de daqui a N dias (padrao 1, ou
 * seja, a vespera). A passada das 09:20 avisa o dia inteiro de amanha; as
 * seguintes pegam quem marcou depois. A mensagem pede que o paciente confirme
 * ou peca para remarcar; a resposta cai no meta-webhook.
 *
 * Duas regras deliberadas, iguais as do disparo de acompanhamentos:
 *  - so envia para quem ja tem consentimento registrado. Um robo nao presume
 *    opt-in em nome da equipe.
 *  - marca reminder_sent_at antes de considerar o trabalho feito, para uma
 *    reexecucao do cron nao mandar a mesma mensagem duas vezes.
 *
 * Desde 07/11/2026 (do sistema do Dr. Marcello) a mesma passada pergunta de
 * novo a quem nao respondeu, ate 3 lembretes no dia (ver repetirLembretes e
 * _shared/lembrete-envio.ts).
 */


type Settings = {
  clinic_id: string
  timezone: string
  phoneNumberId: string
  templateName: string
  templateLanguage: string
  reminderDays: number
  enabled: boolean
}

/**
 * Nao mandar lembrete de madrugada. Fora desta faixa, espera a proxima hora.
 *
 * Comeca as 9, e nao as 8, desde 21/09/2026: a passada das 09:20 e a "da
 * manha", a que avisa o dia inteiro de amanha de uma vez (ver janelaDeLembrete
 * em _shared/lembrete.ts). As 8 ainda e cedo para mensagem de consultorio.
 */
const HORA_INICIAL = 9
const HORA_FINAL = 20

/** Hora local da clinica, para nao acordar ninguem com lembrete. */
function horaLocal(timezone: string) {
  return Number(
    new Date().toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }),
  )
}

type Resumo = { candidatas: number; enviados: number; repetidos: number; pulados: number; falhas: number }
type Detalhe = { appointmentId: string; resultado: string }

/**
 * Pergunta de novo a quem nao respondeu o lembrete (07/11/2026, portado do
 * sistema do Dr. Marcello, onde nasceu em 29/10).
 *
 * Candidatas: consulta ainda marcada, sem confirmacao nem pedido de remarcar,
 * com o primeiro lembrete ha quase 4 horas ou mais, dentro da mesma janela do
 * lembrete (mais de 2 horas para a consulta, ate o fim do dia de amanha). A
 * regra de mandar ou nao esta em repetirOLembrete, coberta por testes.
 *
 * Quantos ja sairam e quando foi o ultimo vem das mensagens da consulta, e nao
 * de coluna nova: elas ja guardam o lembrete da vespera e os do botao da
 * equipe, e assim nao ha migration para travar o banco (ver CLAUDE.md).
 *
 * A repeticao vai para a conversa do lembrete anterior: a resposta cai onde a
 * equipe ja esta olhando.
 */
async function repetirLembretes(
  admin: ReturnType<typeof adminClient>,
  clinica: Settings,
  token: string,
  graphVersion: string,
  listaTeste: string[] | null,
  resumo: Resumo,
  detalhes: Detalhe[],
) {
  const agora = Date.now()
  const { inicio, fim } = janelaDeLembrete(new Date(agora), clinica.reminderDays, clinica.timezone)
  const { data: consultas, error } = await admin
    .from('appointments')
    .select('id,patient_id,starts_at,modality,contact_name,reminder_sent_at,clinic_units(name)')
    .eq('clinic_id', clinica.clinic_id)
    .eq('status', 'scheduled')
    .lt('reminder_sent_at', new Date(agora - ESPERA_PARA_REPETIR_MS).toISOString())
    .is('confirmed_at', null)
    .is('reschedule_requested_at', null)
    .gte('starts_at', inicio.toISOString())
    .lt('starts_at', fim.toISOString())
    .order('starts_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(`nao li as consultas: ${error.message}`)

  for (const consulta of consultas ?? []) {
    const pular = (motivo: string) => {
      resumo.pulados += 1
      detalhes.push({ appointmentId: consulta.id, resultado: `repeticao: ${motivo}` })
    }

    // So a rodada da vespera conta: do lembrete que gravou reminder_sent_at
    // em diante (1 minuto de folga entre o relogio da funcao e o do banco). Um
    // "Pedir confirmacao" da recepcao dias antes nao gasta as 3 perguntas.
    const desdeAVespera = new Date(new Date(consulta.reminder_sent_at).getTime() - 60 * 1000).toISOString()
    const { data: envios, error: erroEnvios } = await admin
      .from('whatsapp_messages')
      .select('conversation_id,created_at')
      .eq('appointment_id', consulta.id)
      .eq('direction', 'outbound')
      .eq('template_name', clinica.templateName)
      .gte('created_at', desdeAVespera)
      .order('created_at', { ascending: true })
      .limit(20)
    if (erroEnvios) {
      console.error('Repeticao do lembrete: nao li os envios da consulta', erroEnvios)
      resumo.falhas += 1
      detalhes.push({ appointmentId: consulta.id, resultado: `REPETICAO_SEM_ENVIOS: ${erroEnvios.message}` })
      continue
    }
    if (!envios?.length) {
      pular('nenhum lembrete registrado na conversa')
      continue
    }
    const primeiro = envios[0]
    const ultimo = envios[envios.length - 1]

    const { count: escritas, error: erroEscritas } = await admin
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', ultimo.conversation_id)
      .eq('direction', 'inbound')
      .gt('created_at', primeiro.created_at)
    if (erroEscritas) {
      console.error('Repeticao do lembrete: nao li as respostas do paciente', erroEscritas)
      resumo.falhas += 1
      detalhes.push({ appointmentId: consulta.id, resultado: `REPETICAO_SEM_RESPOSTAS: ${erroEscritas.message}` })
      continue
    }

    const decisao = repetirOLembrete(
      { envios: envios.length, ultimoEnvio: ultimo.created_at, familiaEscreveu: (escritas ?? 0) > 0 },
      agora,
    )
    if (!decisao.repetir) {
      pular(decisao.motivo)
      continue
    }

    // As mesmas travas do primeiro lembrete: quem pediu para sair e a lista
    // da clinica de teste.
    const { data: conversa } = await admin
      .from('whatsapp_conversations')
      .select('id,wa_id,status,patient_id')
      .eq('id', ultimo.conversation_id)
      .maybeSingle()
    if (!conversa?.wa_id) {
      pular('conversa nao encontrada')
      continue
    }
    if (conversa.status === 'opted_out') {
      pular('opt-out')
      continue
    }
    const { data: paciente } = consulta.patient_id
      ? await admin
          .from('patients')
          .select('id,name,whatsapp_opt_out_at')
          .eq('id', consulta.patient_id)
          .maybeSingle()
      : { data: null }
    if (paciente?.whatsapp_opt_out_at) {
      pular('opt-out')
      continue
    }
    if (foraDaListaDeTeste(listaTeste, conversa.wa_id)) {
      pular('fora da lista de teste')
      continue
    }

    const envio = await mandarLembrete(admin, {
      clinicId: clinica.clinic_id,
      conversationId: conversa.id,
      patientId: paciente?.id ?? conversa.patient_id ?? null,
      appointmentId: consulta.id,
      waId: conversa.wa_id,
      phoneNumberId: clinica.phoneNumberId,
      token,
      graphVersion,
      modelo: clinica.templateName,
      idioma: clinica.templateLanguage,
      parametros: parametrosDoLembrete(consulta, paciente?.name || consulta.contact_name || 'paciente', clinica.timezone),
      automatico: true,
    })
    if (envio.ok) {
      resumo.repetidos += 1
      detalhes.push({ appointmentId: consulta.id, resultado: `repetido (lembrete ${envios.length + 1})` })
    } else {
      resumo.falhas += 1
      detalhes.push({ appointmentId: consulta.id, resultado: `REPETICAO_RECUSADA: ${envio.motivo}` })
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const expected = Deno.env.get('CRON_SECRET')?.trim()
  if (!expected) return json({ error: 'CRON_SECRET não configurado no servidor.' }, 503)
  if (req.headers.get('x-cron-secret')?.trim() !== expected) return json({ error: 'Não autorizado.' }, 401)

  // A chave e por numero desde 27/09/2026 (ver whatsapp-teste.ts). Sem nem a
  // chave geral, nenhuma clinica envia: responde erro para o painel acusar.
  if (!chaveDoWhatsApp(null)) return json({ error: 'Token do WhatsApp não configurado.' }, 503)

  try {
    const admin = adminClient()
    const graphVersion = Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0'

    // Retomada do Direct do Instagram (07/10/2026): pega carona nesta passada
    // de hora em hora. Falha aqui não segura os lembretes de consulta.
    let instagram: { candidatas: number; enviadas: number; falhas: number } | { erro: string }
    try {
      instagram = await retomarConversasDoInstagram(admin)
    } catch (erro) {
      console.error('Retomada do Instagram falhou', erro)
      instagram = { erro: erro instanceof Error ? erro.message : String(erro) }
    }

    const { data: linhas, error: settingsError } = await admin
      .from('clinic_settings')
      .select(
        'clinic_id,whatsapp_phone_number_id,whatsapp_reminder_template_name,whatsapp_template_language,' +
          'appointment_reminder_days,appointment_reminder_enabled,clinics(timezone)',
      )
      .eq('appointment_reminder_enabled', true)
      .not('whatsapp_phone_number_id', 'is', null)

    if (settingsError) {
      console.error('Settings lookup failed', settingsError)
      return json({ error: 'Erro ao ler as configurações.', details: settingsError.message }, 500)
    }

    const clinicas: Settings[] = (linhas ?? []).map((linha) => ({
      clinic_id: linha.clinic_id,
      timezone:
        (linha.clinics as { timezone?: string } | null)?.timezone || 'America/Sao_Paulo',
      phoneNumberId: linha.whatsapp_phone_number_id as string,
      templateName: linha.whatsapp_reminder_template_name || 'lembrete_consulta',
      templateLanguage: linha.whatsapp_template_language || 'pt_BR',
      reminderDays: linha.appointment_reminder_days ?? 1,
      enabled: true,
    }))

    const resumo: Resumo = { candidatas: 0, enviados: 0, repetidos: 0, pulados: 0, falhas: 0 }
    const detalhes: Detalhe[] = []

    for (const clinica of clinicas) {
      const hora = horaLocal(clinica.timezone)
      if (hora < HORA_INICIAL || hora >= HORA_FINAL) {
        detalhes.push({ appointmentId: '-', resultado: `fora do horario (${hora}h)` })
        continue
      }

      const { inicio, fim } = janelaDeLembrete(new Date(), clinica.reminderDays, clinica.timezone)
      const token = chaveDoWhatsApp(clinica.phoneNumberId) as string
      const listaTeste = await listaDeTeste(admin, clinica.clinic_id)

      const { data: consultas, error: consultasError } = await admin
        .from('appointments')
        .select('id,patient_id,starts_at,unit_id,modality,contact_name,contact_phone,clinic_units(name),' +
          'intake_patient_name,intake_birth_date,intake_guardian,intake_cpf,intake_email,reminder_failed_at')
        .eq('clinic_id', clinica.clinic_id)
        .eq('status', 'scheduled')
        .is('reminder_sent_at', null)
        .gte('starts_at', inicio.toISOString())
        .lt('starts_at', fim.toISOString())
        // Consulta sem paciente vinculado tambem recebe lembrete: quem marcou
        // sozinho pelo WhatsApp e justamente quem mais falta, e o telefone do
        // contato basta para avisar.
        .order('starts_at', { ascending: true })
        .limit(200)

      if (consultasError) {
        console.error('Appointment lookup failed', consultasError)
        continue
      }

      resumo.candidatas += consultas?.length ?? 0

      for (const consulta of consultas ?? []) {
        // Recusado pela Meta ha menos de 3 horas: nao tenta de novo ainda.
        // Ate 24/09/2026 a recusa voltava a cada passada de hora em hora e
        // deixava ate onze mensagens "falhou" na conversa. A etiqueta "Lembrete
        // falhou" e o "Ligar hoje" da Agenda ja avisam a recepcao; aqui fica so
        // uma nova tentativa espacada, para o caso de a Meta ter caido.
        const falhouEm = (consulta as { reminder_failed_at?: string | null }).reminder_failed_at
        if (falhouEm && Date.now() - new Date(falhouEm).getTime() < 3 * 3600 * 1000) {
          resumo.pulados += 1
          detalhes.push({ appointmentId: consulta.id, resultado: 'recusado ha pouco; nova tentativa em 3h' })
          continue
        }

        const { data: encontrado } = consulta.patient_id
          ? await admin
              .from('patients')
              .select('id,name,phone,whatsapp_opt_out_at')
              .eq('id', consulta.patient_id)
              .maybeSingle()
          : { data: null }

        // Sem cadastro na vespera: cria agora, com o que a familia informou ao
        // marcar. Se nao der, o lembrete segue assim mesmo - avisar a pessoa da
        // consulta dela nao depende de haver prontuario.
        const paciente =
          encontrado ??
          (consulta.patient_id ? null : await cadastrarDaFicha(admin, clinica.clinic_id, consulta))

        // Quem pediu para nao receber nada e respeitado sempre, e essa e a
        // unica trava que sobrou. A exigencia de opt-in registrado saiu daqui:
        // ela so era gravada no envio do acompanhamento de 30 dias, entao
        // paciente novo com consulta na semana seguinte nunca recebia lembrete.
        // Avisar alguem da propria consulta que ele marcou nao depende de
        // consentimento de marketing.
        if (paciente?.whatsapp_opt_out_at) {
          resumo.pulados += 1
          detalhes.push({ appointmentId: consulta.id, resultado: 'opt-out' })
          continue
        }

        const telefone = paciente?.phone || consulta.contact_phone || ''
        const nomeParaMensagem =
          paciente?.name || consulta.contact_name || 'paciente'

        if (!telefone) {
          resumo.pulados += 1
          detalhes.push({ appointmentId: consulta.id, resultado: 'sem telefone' })
          continue
        }

        // Clinica de teste: so os celulares cadastrados no numero de teste da
        // Meta recebem. O resto e paciente ficticio - tentar seria so uma
        // recusa da Meta por dia em cada um.
        if (foraDaListaDeTeste(listaTeste, telefone)) {
          resumo.pulados += 1
          detalhes.push({ appointmentId: consulta.id, resultado: 'fora da lista de teste' })
          continue
        }

        const agora = new Date().toISOString()

        // Quem nao tem cadastro tambem pode ter pedido para sair - nesse caso o
        // "sair" fica gravado na conversa, e nao no paciente. Sem esta checagem
        // o lembrete furaria justamente quem pediu silencio.
        //
        // Procurada em todas as grafias do numero (nono digito, ver
        // telefone-br.ts). Achando, o lembrete vai para o numero que o
        // WhatsApp da pessoa usa de fato e cai na MESMA conversa - antes abria
        // uma segunda, e a resposta da familia chegava na outra.
        const { data: conversaAtual } = await admin
          .from('whatsapp_conversations')
          .select('status,wa_id')
          .eq('clinic_id', clinica.clinic_id)
          .in('wa_id', variantesDoTelefone(telefone))
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const waId = (conversaAtual?.wa_id as string | undefined) ?? toBrazilE164(telefone)

        if (conversaAtual?.status === 'opted_out') {
          resumo.pulados += 1
          detalhes.push({ appointmentId: consulta.id, resultado: 'opt-out' })
          continue
        }
        // Nome, data, hora e lugar do modelo. Na telemedicina o lugar diz "por
        // video", e nao o nome da unidade que cedeu o horario (ver
        // unidadeDoLembrete em _shared/lembrete-envio.ts).
        const parametros = parametrosDoLembrete(consulta, nomeParaMensagem, clinica.timezone)

        const { data: conversa, error: conversaError } = await admin
          .from('whatsapp_conversations')
          .upsert(
            {
              clinic_id: clinica.clinic_id,
              // Nulo aqui apagaria o vinculo que a conversa ja tinha (irmao,
              // responsavel). Mesmo defeito corrigido no webhook em 24/09/2026.
              ...(paciente?.id ? { patient_id: paciente.id } : {}),
              wa_id: waId,
              display_phone: telefone,
              // status fica de fora: o padrao da coluna ja e 'open' para uma
              // conversa nova, e forcar aqui reabriria quem estava resolvido.
              last_message_at: agora,
            },
            { onConflict: 'clinic_id,wa_id' },
          )
          .select('id')
          .single()

        if (conversaError || !conversa) {
          console.error('Conversation upsert failed', conversaError)
          resumo.falhas += 1
          detalhes.push({ appointmentId: consulta.id, resultado: 'CONVERSATION_FAILED' })
          continue
        }

        // O envio e o registro na conversa sao os mesmos da repeticao e do
        // botao da conversa (mandarLembrete em _shared/lembrete-envio.ts).
        const envio = await mandarLembrete(admin, {
          clinicId: clinica.clinic_id,
          conversationId: conversa.id,
          patientId: paciente?.id ?? null,
          appointmentId: consulta.id,
          waId,
          phoneNumberId: clinica.phoneNumberId,
          token,
          graphVersion,
          modelo: clinica.templateName,
          idioma: clinica.templateLanguage,
          parametros,
          automatico: true,
        })

        if (!envio.ok) {
          await admin
            .from('appointments')
            .update({ reminder_failed_at: envio.quando, reminder_failure_reason: envio.motivo })
            .eq('id', consulta.id)
          resumo.falhas += 1
          detalhes.push({ appointmentId: consulta.id, resultado: `META_REJECTED: ${envio.motivo}` })
          continue
        }

        await admin
          .from('appointments')
          .update({ reminder_sent_at: envio.quando, reminder_failed_at: null, reminder_failure_reason: null })
          .eq('id', consulta.id)

        resumo.enviados += 1
        detalhes.push({ appointmentId: consulta.id, resultado: 'enviado' })
      }

      // Depois dos lembretes novos, a repeticao de quem nao respondeu. Em
      // try/catch: um defeito aqui custa a repeticao, nunca o lembrete da
      // vespera, que ja saiu acima.
      try {
        await repetirLembretes(admin, clinica, token, graphVersion, listaTeste, resumo, detalhes)
      } catch (erro) {
        console.error('Repeticao do lembrete falhou', erro)
        resumo.falhas += 1
        detalhes.push({ appointmentId: '-', resultado: `REPETICAO_FALHOU: ${erro instanceof Error ? erro.message : String(erro)}` })
      }
    }

    console.log('appointment-reminders', JSON.stringify(resumo))
    return json({ ok: true, ...resumo, detalhes, instagram })
  } catch (error) {
    console.error(error)
    return json({ error: 'Falha no envio dos lembretes.' }, 500)
  }
})
