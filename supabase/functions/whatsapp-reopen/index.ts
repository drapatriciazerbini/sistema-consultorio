import { adminClient, corsHeaders, json, userClient } from '../_shared/whatsapp.ts'
import { textoDoModelo } from '../_shared/modelos.ts'
import { primeiroNomeUtil } from '../_shared/nome.ts'
import { chaveDoWhatsApp } from '../_shared/whatsapp-teste.ts'
import { variantesDoTelefone } from '../_shared/telefone-br.ts'
import {
  conteudoDoDocumento,
  LIMITE_DO_ARQUIVO,
  limparParametro as limparDoDocumento,
  MODELO_DO_DOCUMENTO,
  nomeDoArquivo,
  parametrosDoDocumento,
  TIPOS_DE_ARQUIVO,
  TIPOS_DE_DOCUMENTO,
  tipoDeDocumento,
  type TipoDeDocumento,
} from '../_shared/documento.ts'
import { postarNaMeta } from '../_shared/meta-tentativa.ts'

/**
 * Falar com alguem cuja janela de 24 horas ja fechou.
 *
 * Fora da janela a Meta so aceita modelo aprovado, e existem dois caminhos:
 *
 *  - CONVITE (sem `mensagem`): o modelo pede que a pessoa responda. Nao resolve
 *    o assunto, reabre a porta - ela responde, a janela volta a contar, e a
 *    equipe escreve livremente pela tela de sempre. Serve quando o assunto e
 *    longo demais para caber num modelo.
 *
 *  - RESPOSTA (com `mensagem`): o texto que a equipe digitou vai dentro de um
 *    modelo de utilidade, e a familia le a resposta na hora. Serve para o caso
 *    comum: alguem perguntou algo simples ontem e merece a resposta, nao um
 *    pedido para escrever de novo.
 *
 *  - DOCUMENTO (formulario com `arquivo`, 07/11/2026, do sistema do Dr.
 *    Marcello): receita, 2a via, atestado. O PDF vai no cabecalho do modelo documento_do_consultorio, com
 *    o tipo e o paciente no texto. Ver _shared/documento.ts.
 *
 * Recusa de proposito quando a janela AINDA esta aberta. Ali o texto livre
 * funciona, chega mais completo e (ate outubro de 2026) e gratuito; gastar um
 * modelo no lugar dele seria pagar para dizer menos.
 */

const JANELA_HORAS = 24

/**
 * Limite do texto da equipe.
 *
 * O corpo inteiro do modelo cabe em 1024 caracteres na Meta, e a moldura
 * ("Olá, Fulano. Aqui é o consultório...") ja come uma parte. 700 deixa folga
 * confortavel e ainda e mais do que qualquer resposta de recepcao precisa.
 */
const LIMITE_DA_MENSAGEM = 700

type ReopenRequest = { conversationId?: string; mensagem?: string }

/**
 * Deixa o texto no formato que a Meta aceita como parametro.
 *
 * Parametro de modelo nao pode conter quebra de linha, tabulacao nem quatro
 * espacos seguidos - a Meta recusa a mensagem inteira, com erro generico. Em
 * vez de devolver "erro 132000" para a recepcao, as quebras viram espaco.
 */
function limparParametro(texto: string): string {
  return texto.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
}

/**
 * O modelo de documento da clinica. Coluna de 28/10/2026, lida a parte
 * (CLAUDE.md): sem a migration, vale o nome padrao e o envio segue.
 */
async function modeloDoDocumento(admin: ReturnType<typeof adminClient>, clinicId: string): Promise<string> {
  try {
    const { data, error } = await admin
      .from('clinic_settings')
      .select('whatsapp_document_template_name')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (error) throw error
    return data?.whatsapp_document_template_name || MODELO_DO_DOCUMENTO
  } catch (erro) {
    console.warn('Sem whatsapp_document_template_name; vai o modelo padrao', erro)
    return MODELO_DO_DOCUMENTO
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Sessão obrigatória.' }, 401)

    // Documento chega como formulario (multipart), como o arquivo de whatsapp-reply.
    let body: ReopenRequest
    let documento: { arquivo: File; tipo: TipoDeDocumento; paciente: string } | null = null
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await req.formData()
      body = { conversationId: String(form.get('conversationId') ?? '') }
      const arquivo = form.get('arquivo')
      const tipo = tipoDeDocumento(form.get('tipo'))
      const paciente = limparDoDocumento(form.get('paciente'), 60)
      if (!(arquivo instanceof File) || arquivo.size === 0) return json({ error: 'Escolha o arquivo do documento.' }, 400)
      if (!TIPOS_DE_ARQUIVO.includes(arquivo.type)) {
        return json({ error: 'Envie o documento em PDF (ou Word). Foto não vai neste modelo.', code: 'TIPO_RECUSADO' }, 400)
      }
      if (arquivo.size > LIMITE_DO_ARQUIVO) return json({ error: 'Arquivo grande demais: o limite é 20 MB.', code: 'GRANDE_DEMAIS' }, 400)
      if (!tipo) return json({ error: 'Diga qual é o documento (receita, atestado...).', code: 'SEM_TIPO' }, 400)
      // A Meta recusa parametro vazio, e "Segue em anexo a receita de ." nao
      // pode chegar no celular: sem paciente, nada sai.
      if (!paciente) return json({ error: 'Diga de qual paciente é o documento.', code: 'SEM_PACIENTE' }, 400)
      documento = { arquivo, tipo, paciente }
    } else {
      body = (await req.json()) as ReopenRequest
    }
    if (!body.conversationId) return json({ error: 'Conversa não informada.' }, 400)

    const mensagem = limparParametro(body.mensagem ?? '')
    if (mensagem.length > LIMITE_DA_MENSAGEM) {
      return json({
        error: `A mensagem passa de ${LIMITE_DA_MENSAGEM} caracteres. Encurte ou envie o convite para conversar livremente.`,
        code: 'TOO_LONG',
      }, 400)
    }

    // A RLS e a autorizacao: so aparece conversa de clinica onde o usuario e
    // membro ativo. Se nao vier nada, ele nao pode escrever para esta pessoa.
    const scoped = userClient(authorization)
    const { data: visivel, error: visivelError } = await scoped
      .from('whatsapp_conversations')
      .select('id,clinic_id,patient_id,wa_id,status,profile_name')
      .eq('id', body.conversationId)
      .maybeSingle()

    if (visivelError) {
      console.error('RLS lookup failed', visivelError)
      return json({ error: 'Falha ao verificar a conversa.', code: 'RLS_LOOKUP_FAILED' }, 500)
    }
    if (!visivel) {
      return json({ error: 'Esta conversa não pertence à sua clínica.', code: 'NOT_VISIBLE' }, 403)
    }
    if (visivel.status === 'opted_out') {
      return json({
        error: 'Este contato pediu para não receber mensagens.',
        code: 'OPTED_OUT',
      }, 409)
    }

    const admin = adminClient()

    // Documento de saude so vai para telefone de paciente cadastrado. E a regra
    // da 2a via (migration 20260924000900): farmacia ou numero desconhecido
    // pedindo receita nao recebe documento; quem recebe e o paciente, pelo
    // canal dele. Sem esta trava, um PDF anexado na conversa errada sairia.
    if (documento) {
      let temCadastro = Boolean(visivel.patient_id)
      if (!temCadastro) {
        const { data: fichas } = await admin
          .from('patients')
          .select('id')
          .eq('clinic_id', visivel.clinic_id)
          .is('archived_at', null)
          .in('phone_digits', variantesDoTelefone(visivel.wa_id ?? ''))
          .limit(1)
        temCadastro = Boolean(fichas?.length)
      }
      if (!temCadastro) {
        return json({
          error: 'Este número não é de nenhum paciente cadastrado. Documento só vai para o telefone do cadastro do paciente.',
          code: 'SEM_CADASTRO',
        }, 409)
      }
    }

    const { data: ultimaEntrada } = await admin
      .from('whatsapp_messages')
      .select('created_at')
      .eq('conversation_id', visivel.id)
      .eq('direction', 'inbound')
      // "[unsupported]" (talvez ligacao) nao abre a janela de 24h (16/10/2026).
      .neq('message_type', 'unsupported')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ultimaEntrada) {
      const fechaEm = new Date(
        new Date(ultimaEntrada.created_at).getTime() + JANELA_HORAS * 3600 * 1000,
      )
      if (Date.now() <= fechaEm.getTime()) {
        return json({
          error: documento
            ? 'A janela ainda está aberta: mande o arquivo pelo botão Arquivo da caixa de resposta.'
            : 'A janela ainda está aberta. Responda com texto livre, que chega mais completo.',
          code: 'WINDOW_OPEN',
        }, 409)
      }
    }

    const { data: settings } = await admin
      .from('clinic_settings')
      .select(
        'whatsapp_phone_number_id,whatsapp_reopen_template_name,whatsapp_reply_template_name,whatsapp_template_language',
      )
      .eq('clinic_id', visivel.clinic_id)
      .single()

    if (!settings?.whatsapp_phone_number_id) {
      return json({ error: 'Configuração do WhatsApp incompleta.', code: 'INCOMPLETE' }, 409)
    }

    const token = chaveDoWhatsApp(settings.whatsapp_phone_number_id)
    if (!token) return json({ error: 'Token do WhatsApp não configurado.', code: 'NO_TOKEN' }, 503)

    // O nome de quem recebe. Sem cadastro, vale o nome do perfil do WhatsApp; e
    // sem nenhum dos dois, um tratamento neutro - a Meta recusa a mensagem
    // inteira se a variavel vier vazia.
    //
    // Nome de perfil passa por primeiroNomeUtil: "tudo bem", emoji ou "Mae do
    // Joao" nao viram nome. Sem nome util, o modelo recebe "tudo bem" (vira
    // "Ola, tudo bem!") e o historico diz so "retomar o atendimento".
    let nomeUtil = primeiroNomeUtil(visivel.profile_name)
    let responsavel: string | null = null
    if (visivel.patient_id) {
      const { data: paciente } = await admin
        .from('patients')
        .select('name,guardian_name')
        .eq('id', visivel.patient_id)
        .maybeSingle()
      if (paciente?.name) nomeUtil = primeiroNomeUtil(paciente.name, true)
      responsavel = primeiroNomeUtil(paciente?.guardian_name, true)
    }
    const primeiroNome = nomeUtil ?? 'tudo bem'

    // Tres modelos, um caminho de codigo. O que muda e o nome e os parametros:
    // o convite leva so o nome; a resposta leva o nome e o texto da equipe; o
    // documento leva quem le, o tipo e o paciente, e o arquivo no cabecalho.
    const enviandoResposta = mensagem.length > 0
    const idioma = settings.whatsapp_template_language || 'pt_BR'
    const templateName = documento
      ? await modeloDoDocumento(admin, visivel.clinic_id)
      : enviandoResposta
        ? settings.whatsapp_reply_template_name || 'resposta_da_clinica'
        : settings.whatsapp_reopen_template_name || 'retomar_atendimento'
    const parametros = documento
      // Quem le e o dono do WhatsApp: o nome do perfil, quando e nome de
      // gente; senao o responsavel do cadastro. No sistema do Dr. Marcello
      // (pediatria) o responsavel vinha primeiro, porque quem le e sempre a mae.
      // Aqui o numero pode ser da propria paciente idosa ou da filha que cuida,
      // e o perfil diz qual dos dois - "Ola, Ana... a receita de Maria" para a
      // filha, "Ola, Maria... a receita de Maria" para a paciente.
      ? parametrosDoDocumento(primeiroNomeUtil(visivel.profile_name) ?? responsavel ?? '', documento.tipo, documento.paciente)
      : enviandoResposta ? [primeiroNome, mensagem] : [primeiroNome]
    const graphVersion = Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v25.0'
    const agora = new Date().toISOString()

    let conteudo: Record<string, unknown> = {
      type: 'template',
      template: {
        name: templateName,
        language: { code: idioma },
        components: [
          { type: 'body', parameters: parametros.map((valor) => ({ type: 'text', text: valor })) },
        ],
      },
    }

    // O historico guarda o que a familia LEU, e nao o nome tecnico do modelo.
    // Na resposta isso e essencial: o texto que a equipe escreveu e o conteudo
    // do atendimento, e some se guardarmos "modelo enviado".
    const resumo = documento
      ? textoDoModelo(templateName, parametros) ??
        `Documento enviado: ${TIPOS_DE_DOCUMENTO[documento.tipo].frase} de ${documento.paciente}.`
      : enviandoResposta
        ? textoDoModelo(templateName, parametros) ?? mensagem
        // ATENCAO: listConversations (repository.ts) reconhece o convite pelo
        // comeco deste texto para nao conta-lo como resposta. Mudou aqui, muda la.
        : nomeUtil
          ? `Mensagem enviada para retomar o atendimento com ${nomeUtil}.`
          : 'Mensagem enviada para retomar o atendimento.'

    // Documento: guarda no acervo (a conversa mostra o arquivo que foi), sobe
    // para a Meta e manda pelo id que ela devolve - o mesmo de whatsapp-reply.
    let midia: { media_path: string; media_mime: string } | null = null
    if (documento) {
      const { arquivo } = documento
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const caminho = `${visivel.clinic_id}/saida-${crypto.randomUUID()}`
      const { error: erroAcervo } = await admin.storage
        .from('whatsapp-anexos')
        .upload(caminho, bytes, { contentType: arquivo.type, upsert: false })
      if (erroAcervo) {
        console.error('Nao consegui guardar o documento no acervo', erroAcervo)
        return json({ error: 'Não consegui guardar o arquivo. Nada foi enviado.', code: 'ACERVO' }, 500)
      }
      midia = { media_path: caminho, media_mime: arquivo.type }

      const nome = nomeDoArquivo(documento.tipo, documento.paciente, arquivo.name || 'documento.pdf')
      const paraMeta = new FormData()
      paraMeta.append('messaging_product', 'whatsapp')
      paraMeta.append('type', arquivo.type)
      paraMeta.append('file', new Blob([bytes], { type: arquivo.type }), nome)
      const subida = await fetch(
        `https://graph.facebook.com/${graphVersion}/${settings.whatsapp_phone_number_id}/media`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: paraMeta },
      )
      const subidaCorpo = await subida.json().catch(() => ({}))
      if (!subida.ok || !subidaCorpo?.id) {
        const motivo = subidaCorpo?.error?.message || 'A Meta recusou o arquivo.'
        console.error('Meta recusou o upload do documento', subidaCorpo)
        await admin.from('whatsapp_messages').insert({
          clinic_id: visivel.clinic_id,
          conversation_id: visivel.id,
          patient_id: visivel.patient_id,
          direction: 'outbound',
          automatic: false,
          message_type: 'template',
          template_name: templateName,
          body: resumo,
          status: 'failed',
          failed_at: agora,
          failure_reason: motivo,
          ...midia,
        })
        return json({ error: 'A Meta recusou o arquivo.', code: 'META_REJECTED', details: motivo }, 502)
      }
      conteudo = conteudoDoDocumento({ modelo: templateName, idioma, mediaId: subidaCorpo.id, arquivo: nome, parametros })
    }

    const resposta = await postarNaMeta(
      `https://graph.facebook.com/${graphVersion}/${settings.whatsapp_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: visivel.wa_id,
          ...conteudo,
        }),
      },
    )

    const corpo = await resposta.json()

    if (!resposta.ok) {
      const motivo = corpo?.error?.message || 'Meta recusou o envio.'
      await admin.from('whatsapp_messages').insert({
        clinic_id: visivel.clinic_id,
        conversation_id: visivel.id,
        patient_id: visivel.patient_id,
        direction: 'outbound',
        automatic: false,
        message_type: 'template',
        template_name: templateName,
        body: resumo,
        status: 'failed',
        failed_at: agora,
        failure_reason: motivo,
        ...(midia ?? {}),
      })
      // 132001 = template inexistente ou ainda nao aprovado naquele idioma. E o
      // erro esperado enquanto a Meta nao aprovou, e merece texto proprio.
      const naoAprovado = corpo?.error?.code === 132001 || /template/i.test(String(motivo))
      return json({
        error: naoAprovado
          ? `O modelo "${templateName}" ainda não está aprovado na Meta. Assim que a aprovação sair, este botão funciona.`
          : 'A Meta recusou o envio.',
        code: naoAprovado ? 'TEMPLATE_NOT_APPROVED' : 'META_REJECTED',
        details: motivo,
      }, 502)
    }

    const { error: salvaError } = await admin.from('whatsapp_messages').insert({
      clinic_id: visivel.clinic_id,
      conversation_id: visivel.id,
      patient_id: visivel.patient_id,
      external_message_id: corpo?.messages?.[0]?.id ?? null,
      direction: 'outbound',
      automatic: false,
      message_type: 'template',
      template_name: templateName,
      body: resumo,
      status: 'accepted',
      sent_at: agora,
      ...(midia ?? {}),
    })

    if (salvaError) {
      console.error('Message insert failed', salvaError)
      return json({
        error: 'A mensagem foi enviada mas não pôde ser registrada.',
        code: 'SAVE_FAILED',
      }, 500)
    }

    await admin
      .from('whatsapp_conversations')
      // Retomar o atendimento tira a conversa de "Concluida" (23/09/2026).
      .update({
        needs_attention: false,
        // O motivo sai junto (24/09/2026). Ficando, ele "ressuscitava": semanas
        // depois o robo acendia a conversa com o motivo velho ("Enviou um
        // arquivo") para quem so escreveu "boa tarde".
        attention_reason: null,
        last_message_at: agora,
        ...(visivel.status === 'resolved' ? { status: 'open' } : {}),
      })
      .eq('id', visivel.id)

    return json({ ok: true, enviadoPara: primeiroNome })
  } catch (causa) {
    console.error('whatsapp-reopen failed', causa)
    return json({ error: 'Falha inesperada ao enviar.', code: 'UNEXPECTED' }, 500)
  }
})
