// Coexistencia (porte de 19/11/2026 do sistema do Dr. Fabio): o numero do
// consultorio da Dra. Patricia no app WhatsApp Business do celular e na API ao
// mesmo tempo. Ver supabase/functions/_shared/coexistencia.ts. Os avisos
// seguem o formato da documentacao da Meta ("Onboarding WhatsApp Business app
// users"), com nomes, telefones e ids inventados (o repositorio e publico).
// Sem Meta e sem banco de verdade. Para provar que um caso pega o defeito,
// ver DESLIGAR em tests/montar-para-teste.mjs.
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conferirDesligar, lerComTrocas, montar } from './montar-para-teste.mjs'
import { bancoFalso } from './fixtures/banco-falso.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SHARED = join(AQUI, '..', 'supabase', 'functions', '_shared')
const C = await montar(join(SHARED, 'coexistencia.ts'), join(AQUI, 'coexistencia.build.mjs'))
// A regra que cala o robo quando a equipe fala: a mesma que o meta-webhook usa.
const L = await montar(join(SHARED, 'lembrete.ts'), join(AQUI, 'coexistencia-lembrete.build.mjs'))

let ok = 0
async function caso(nome, fn) {
  try {
    await fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

const CLINICA = 'b5d0f6a2-3c71-4e8a-9f2d-7a1c4e9b0d63'
const NUMERO_ID = '700000000000001'
const CONSULTORIO = '5513900000000'
// A filha da paciente, com o nono digito; o WhatsApp antigo manda sem ele.
const CLAUDIA = '5513990000101'
const CLAUDIA_SEM_NOVE = '551390000101'
const CUIDADOR = '5513990000102'

const ferramentas = () => {
  const baixados = []
  return {
    baixados,
    corpo: (m) => (m.type === 'text' ? m.text?.body ?? '' : m[m.type]?.caption || `[${m.type}]`),
    midia: (m) => m.image ?? m.audio ?? m.document ?? null,
    guardarAnexo: async (clinica, id, midia) => {
      baixados.push(id)
      return { path: `${clinica}/${id}`, mime: midia.mime_type ?? 'application/octet-stream' }
    },
  }
}

/** Um erro do Postgres/PostgREST no lugar da resposta, awaitavel como o cliente. */
const recusa = (error) => {
  const r = { data: null, error }
  return { then: (okk, ko) => Promise.resolve(r).then(okk, ko) }
}

function banco(tabelas = {}, opcoes = {}) {
  const b = bancoFalso(
    {
      clinic_settings: [{ clinic_id: CLINICA, whatsapp_phone_number_id: NUMERO_ID }],
      whatsapp_conversations: [],
      whatsapp_messages: [],
      whatsapp_contatos_do_celular: [],
      patients: [],
      ...tabelas,
    },
    { semTabela: opcoes.semTabela ?? [] },
  )
  const admin = { from: (tabela) => b.from(tabela) }
  // O Postgres sem a coluna nova: o insert com "origem" volta com erro.
  if (opcoes.semOrigem) {
    const from = admin.from
    admin.from = (tabela) => {
      const pedido = from(tabela)
      if (tabela !== 'whatsapp_messages') return pedido
      const insert = pedido.insert.bind(pedido)
      pedido.insert = (valores) => {
        const linhas = Array.isArray(valores) ? valores : [valores]
        if (linhas.some((l) => 'origem' in l)) {
          return recusa({ code: 'PGRST204', message: "Could not find the 'origem' column of 'whatsapp_messages'" })
        }
        return insert(valores)
      }
      return pedido
    }
  }
  return { b, admin, linhas: (t) => b.db[t] ?? [] }
}

const valor = (extra) => ({
  messaging_product: 'whatsapp',
  metadata: { display_phone_number: CONSULTORIO, phone_number_id: NUMERO_ID },
  ...extra,
})
const texto = (from, id, timestamp, body, status = 'READ') => ({
  from,
  id,
  timestamp: String(timestamp),
  type: 'text',
  text: { body },
  history_context: { status },
})
// 20/10/2026 13:00 em Sao Paulo = 16:00 UTC.
const T0 = Date.UTC(2026, 9, 20, 16, 0, 0) / 1000
const historico = (threads, metadata = { phase: 1, chunk_order: 1, progress: 55 }) =>
  valor({ history: [{ metadata, threads }] })
const eco = (para, id, timestamp, body) =>
  valor({ message_echoes: [{ from: CONSULTORIO, to: para, id, timestamp: String(timestamp), type: 'text', text: { body } }] })

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

await caso('131060 e mensagem que so o celular mostra; outro unsupported nao', async () => {
  assert.equal(C.soNoCelular({ type: 'unsupported', errors: [{ code: 131060, title: 'Unsupported message type' }] }), true)
  assert.equal(C.soNoCelular({ type: 'unsupported', errors: [{ code: 131051 }] }), false)
  assert.equal(C.soNoCelular({ type: 'unsupported' }), false, 'o unsupported de hoje segue o caminho de antes')
  assert.equal(C.soNoCelular({ type: 'text', errors: [{ code: 131060 }] }), false)
  assert.equal(C.soNoCelular(null), false)
})

await caso('os tres campos da coexistencia; messages segue no webhook', async () => {
  for (const campo of ['history', 'smb_message_echoes', 'smb_app_state_sync']) assert.equal(C.campoDoCelular(campo), true, campo)
  for (const campo of ['messages', 'account_update', undefined]) assert.equal(C.campoDoCelular(campo), false, String(campo))
})

await caso('status do historico no status do banco', async () => {
  assert.equal(C.statusDoHistorico('READ'), 'read')
  assert.equal(C.statusDoHistorico('PLAYED'), 'read')
  assert.equal(C.statusDoHistorico('DELIVERED'), 'delivered')
  assert.equal(C.statusDoHistorico('SENT'), 'sent')
  assert.equal(C.statusDoHistorico('PENDING'), 'queued')
  assert.equal(C.statusDoHistorico('ERROR'), 'failed')
  assert.equal(C.statusDoHistorico(undefined), 'sent')
})

await caso('historico: quem escreveu, quando, e o arquivo que ficou no celular', async () => {
  const f = ferramentas()
  const leitura = C.lerHistorico(
    historico([
      {
        id: CLAUDIA,
        messages: [
          texto(CONSULTORIO, 'wamid.H1', T0, 'Bom dia, segue o endereço do consultório no Gonzaga.'),
          { from: CONSULTORIO, id: 'wamid.H2', timestamp: String(T0 + 15), type: 'media_placeholder', history_context: { status: 'PLAYED' } },
          // A Claudia no WhatsApp antigo, sem o nono digito.
          texto(CLAUDIA_SEM_NOVE, 'wamid.H3', T0 + 60, 'Obrigada! Levo minha mãe na quinta.'),
        ],
      },
    ]),
    f,
  )
  assert.equal(leitura.recusado, false)
  assert.deepEqual(leitura.partes, [{ fase: 1, parte: 1, progresso: 55 }])
  assert.equal(leitura.conversas.length, 1)
  const [h1, h2, h3] = leitura.conversas[0].mensagens
  assert.equal(leitura.conversas[0].contato, CLAUDIA)
  assert.equal(h1.direction, 'outbound')
  assert.equal(h1.status, 'read')
  assert.equal(h1.read_at, '2026-10-20T16:00:00.000Z')
  assert.equal(h1.created_at, '2026-10-20T16:00:00.000Z')
  assert.equal(h1.automatic, false)
  assert.equal(h1.origem, 'historico')
  assert.equal(h2.message_type, 'media_placeholder')
  assert.equal(h2.body, C.TEXTO_ARQUIVO_DO_HISTORICO)
  assert.equal(h2.midia, null)
  assert.equal(h3.direction, 'inbound', 'sem o nono digito ainda e a Claudia')
  assert.equal(h3.status, 'delivered')
  assert.equal(h3.body, 'Obrigada! Levo minha mãe na quinta.')
})

await caso('historico recusado no app (2593109): nada a gravar, e diz', async () => {
  const leitura = C.lerHistorico(
    valor({ history: [{ errors: [{ code: 2593109, title: 'History sync is turned off by the business from the WhatsApp Business App' }] }] }),
    ferramentas(),
  )
  assert.equal(leitura.recusado, true)
  assert.equal(leitura.conversas.length, 0)
})

await caso('mensagem sem id ou sem data nao entra', async () => {
  const leitura = C.lerHistorico(
    historico([{ id: CLAUDIA, messages: [{ from: CLAUDIA, type: 'text', text: { body: 'x' }, timestamp: String(T0) }, { from: CLAUDIA, id: 'wamid.X', type: 'text', text: { body: 'y' } }] }]),
    ferramentas(),
  )
  assert.equal(leitura.conversas.length, 0)
})

await caso('contatos da agenda: salvo, e apagado sem nome', async () => {
  const lidos = C.lerContatos(
    valor({
      state_sync: [
        { type: 'contact', contact: { full_name: 'Cláudia filha da Dona Lourdes', first_name: 'Cláudia', phone_number: CLAUDIA }, action: 'add', metadata: { timestamp: String(T0) } },
        { type: 'contact', contact: { phone_number: CUIDADOR }, action: 'remove', metadata: { timestamp: String(T0) } },
      ],
    }),
  )
  assert.deepEqual(lidos[0], { contato: CLAUDIA, nome: 'Cláudia filha da Dona Lourdes', removido: false, em: '2026-10-20T16:00:00.000Z' })
  assert.equal(lidos[1].removido, true)
  assert.equal(lidos[1].nome, null)
})

// ---------------------------------------------------------------------------
// Gravacao
// ---------------------------------------------------------------------------

await caso('historico grava a conversa ligada ao paciente, sem acender nada', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco({
    patients: [{ id: 'pac-lourdes', clinic_id: CLINICA, name: 'Lourdes Teste', phone_digits: '13990000101', archived_at: null }],
  })
  const feito = await C.tratarAvisoDoCelular(
    admin,
    'history',
    historico([
      { id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.A1', T0, 'Quero marcar para a minha mãe'), texto(CONSULTORIO, 'wamid.A2', T0 + 120, 'Tem quinta às 10h.')] },
    ]),
    f,
  )
  assert.equal(feito.clinica, CLINICA)
  assert.equal(feito.gravadas, 2)
  const [conversa] = linhas('whatsapp_conversations')
  assert.equal(conversa.wa_id, CLAUDIA)
  assert.equal(conversa.patient_id, 'pac-lourdes')
  assert.equal(conversa.last_message_at, '2026-10-20T16:02:00.000Z')
  assert.equal(conversa.needs_attention, undefined, 'historico nao pede atencao')
  assert.equal(conversa.unread_count, undefined, 'historico nao conta como nova')
  const mensagens = linhas('whatsapp_messages')
  assert.deepEqual(mensagens.map((m) => [m.external_message_id, m.direction, m.automatic, m.origem]), [
    ['wamid.A1', 'inbound', false, 'historico'],
    ['wamid.A2', 'outbound', false, 'historico'],
  ])
  assert.ok(mensagens.every((m) => m.conversation_id === conversa.id && m.patient_id === 'pac-lourdes' && m.clinic_id === CLINICA))
  assert.ok(mensagens.every((m) => !('midia' in m)), 'o bloco da midia nao vai ao banco')
})

await caso('a Meta manda de novo: nada duplica, e a conversa nao muda', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco()
  const aviso = historico([{ id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.R1', T0, 'Oi')] }])
  await C.tratarAvisoDoCelular(admin, 'history', aviso, f)
  const segunda = await C.tratarAvisoDoCelular(admin, 'history', aviso, f)
  assert.equal(segunda.gravadas, 0)
  assert.equal(linhas('whatsapp_messages').length, 1)
  assert.equal(linhas('whatsapp_conversations').length, 1)
})

await caso('conversa que ja existe sem o nono digito e a mesma; mensagem antiga nao a faz descer', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco({
    whatsapp_conversations: [{ id: 'conv-claudia', clinic_id: CLINICA, wa_id: CLAUDIA_SEM_NOVE, patient_id: null, last_message_at: '2026-10-26T12:00:00.000Z' }],
  })
  await C.tratarAvisoDoCelular(admin, 'history', historico([{ id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.V1', T0, 'Oi')] }]), f)
  assert.equal(linhas('whatsapp_conversations').length, 1)
  assert.equal(linhas('whatsapp_messages')[0].conversation_id, 'conv-claudia')
  assert.equal(linhas('whatsapp_conversations')[0].last_message_at, '2026-10-26T12:00:00.000Z')
})

await caso('conversa nova sem cadastro leva o nome da agenda do celular', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco({
    whatsapp_contatos_do_celular: [{ clinic_id: CLINICA, wa_id: CUIDADOR, nome: 'Jorge cuidador do Sr. Alberto', removido_em: null }],
  })
  await C.tratarAvisoDoCelular(admin, 'history', historico([{ id: CUIDADOR, messages: [texto(CUIDADOR, 'wamid.B1', T0, 'Boa tarde')] }]), f)
  assert.equal(linhas('whatsapp_conversations')[0].nome_personalizado, 'Jorge cuidador do Sr. Alberto')
})

await caso('o arquivo do historico chega depois e entra no lugar do aviso', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco()
  await C.tratarAvisoDoCelular(
    admin,
    'history',
    historico([{ id: CLAUDIA, messages: [{ from: CLAUDIA, id: 'wamid.F1', timestamp: String(T0), type: 'media_placeholder', history_context: { status: 'READ' } }] }]),
    f,
  )
  assert.equal(linhas('whatsapp_messages')[0].body, C.TEXTO_ARQUIVO_DO_HISTORICO)
  const feito = await C.tratarAvisoDoCelular(
    admin,
    'history',
    valor({ messages: [{ from: CLAUDIA, id: 'wamid.F1', timestamp: String(T0), type: 'image', image: { caption: 'Exame de ontem da minha mãe', mime_type: 'image/jpeg', id: '9001' } }] }),
    f,
  )
  assert.equal(feito.arquivos, 1)
  const [foto] = linhas('whatsapp_messages')
  assert.equal(linhas('whatsapp_messages').length, 1)
  assert.equal(foto.message_type, 'image')
  assert.equal(foto.body, 'Exame de ontem da minha mãe')
  assert.equal(foto.media_path, `${CLINICA}/wamid.F1`)
  assert.equal(foto.media_mime, 'image/jpeg')
})

await caso('o arquivo que chega antes do aviso entra como mensagem, e o aviso nao duplica', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco()
  await C.tratarAvisoDoCelular(
    admin,
    'history',
    valor({ messages: [{ from: CLAUDIA, id: 'wamid.G1', timestamp: String(T0), type: 'audio', audio: { mime_type: 'audio/ogg', id: '9002' } }] }),
    f,
  )
  await C.tratarAvisoDoCelular(
    admin,
    'history',
    historico([{ id: CLAUDIA, messages: [{ from: CLAUDIA, id: 'wamid.G1', timestamp: String(T0), type: 'media_placeholder' }] }]),
    f,
  )
  const gravadas = linhas('whatsapp_messages')
  assert.equal(gravadas.length, 1)
  assert.equal(gravadas[0].direction, 'inbound')
  assert.equal(gravadas[0].media_path, `${CLINICA}/wamid.G1`)
})

await caso('arquivo que a Meta nao entregou: a mensagem entra sem ele', async () => {
  const f = { ...ferramentas(), guardarAnexo: async () => null }
  const { admin, linhas } = banco()
  const feito = await C.tratarAvisoDoCelular(
    admin,
    'smb_message_echoes',
    valor({ message_echoes: [{ from: CONSULTORIO, to: CLAUDIA, id: 'wamid.S1', timestamp: String(T0), type: 'document', document: { mime_type: 'application/pdf', id: '9009', caption: 'Receita' } }] }),
    f,
  )
  assert.equal(feito.gravadas, 1)
  assert.equal(linhas('whatsapp_messages')[0].body, 'Receita')
  assert.equal(linhas('whatsapp_messages')[0].media_path, undefined)
})

await caso('a equipe escreveu pelo celular: resposta humana, conversa apagada como pela Central', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco({
    whatsapp_conversations: [
      {
        id: 'conv-claudia',
        clinic_id: CLINICA,
        wa_id: CLAUDIA,
        patient_id: 'pac-lourdes',
        last_message_at: '2026-10-20T15:00:00.000Z',
        needs_attention: true,
        attention_reason: 'atendente',
        unread_count: 3,
        status: 'resolved',
      },
    ],
  })
  const feito = await C.tratarAvisoDoCelular(admin, 'smb_message_echoes', eco(CLAUDIA, 'wamid.E1', T0, 'Oi Cláudia, é do consultório da Dra. Patrícia.'), f)
  assert.equal(feito.gravadas, 1)
  const [doCelular] = linhas('whatsapp_messages')
  assert.equal(doCelular.direction, 'outbound')
  assert.equal(doCelular.automatic, false, 'gente falando: o robo fica quieto 12 horas')
  assert.equal(doCelular.origem, 'celular')
  assert.equal(doCelular.status, 'sent')
  assert.equal(doCelular.patient_id, 'pac-lourdes')
  const [conversa] = linhas('whatsapp_conversations')
  assert.equal(conversa.needs_attention, false)
  assert.equal(conversa.attention_reason, null)
  assert.equal(conversa.unread_count, 0)
  assert.equal(conversa.status, 'open')
  assert.equal(conversa.last_message_at, '2026-10-20T16:00:00.000Z')
})

await caso('foto mandada pelo celular vem com o arquivo; eco repetido nao mexe de novo', async () => {
  const f = ferramentas()
  const { admin, linhas } = banco()
  const aviso = valor({
    message_echoes: [{ from: CONSULTORIO, to: CUIDADOR, id: 'wamid.E2', timestamp: String(T0), type: 'image', image: { mime_type: 'image/png', id: '9003' } }],
  })
  await C.tratarAvisoDoCelular(admin, 'smb_message_echoes', aviso, f)
  assert.equal(linhas('whatsapp_messages')[0].media_path, `${CLINICA}/wamid.E2`)
  assert.deepEqual(f.baixados, ['wamid.E2'])
  linhas('whatsapp_conversations')[0].needs_attention = true
  await C.tratarAvisoDoCelular(admin, 'smb_message_echoes', aviso, f)
  assert.equal(linhas('whatsapp_messages').length, 1)
  assert.deepEqual(f.baixados, ['wamid.E2'], 'nao baixa de novo')
  assert.equal(linhas('whatsapp_conversations')[0].needs_attention, true, 'o reenvio nao apaga um pedido novo')
})

await caso('agenda do celular: o nome vai para a conversa sem cadastro e sem nome dado pela equipe', async () => {
  const { admin, linhas } = banco({
    whatsapp_conversations: [
      { id: 'sem-nada', clinic_id: CLINICA, wa_id: CLAUDIA, patient_id: null, nome_personalizado: null },
      { id: 'com-cadastro', clinic_id: CLINICA, wa_id: CUIDADOR, patient_id: 'pac-alberto', nome_personalizado: null },
    ],
  })
  const aviso = (nome, telefone, action = 'add') =>
    valor({ state_sync: [{ type: 'contact', contact: nome ? { full_name: nome, first_name: nome, phone_number: telefone } : { phone_number: telefone }, action, metadata: { timestamp: String(T0) } }] })
  await C.tratarAvisoDoCelular(admin, 'smb_app_state_sync', aviso('Cláudia da Agenda', CLAUDIA), ferramentas())
  await C.tratarAvisoDoCelular(admin, 'smb_app_state_sync', aviso('Jorge da Agenda', CUIDADOR), ferramentas())
  const conversa = (id) => linhas('whatsapp_conversations').find((c) => c.id === id)
  assert.equal(conversa('sem-nada').nome_personalizado, 'Cláudia da Agenda')
  assert.equal(conversa('com-cadastro').nome_personalizado, null, 'o nome do cadastro ganha')
  assert.equal(linhas('whatsapp_contatos_do_celular').length, 2)

  // Mudou na agenda: o nome que era da agenda acompanha.
  await C.tratarAvisoDoCelular(admin, 'smb_app_state_sync', aviso('Cláudia Regina da Agenda', CLAUDIA), ferramentas())
  assert.equal(conversa('sem-nada').nome_personalizado, 'Cláudia Regina da Agenda')
  // A equipe renomeou na Central: a agenda nao passa por cima.
  conversa('sem-nada').nome_personalizado = 'Cláudia (filha da Dona Lourdes)'
  await C.tratarAvisoDoCelular(admin, 'smb_app_state_sync', aviso('Cláudia R.', CLAUDIA), ferramentas())
  assert.equal(conversa('sem-nada').nome_personalizado, 'Cláudia (filha da Dona Lourdes)')
  // Apagado da agenda: fica a data, a conversa nao perde o nome.
  await C.tratarAvisoDoCelular(admin, 'smb_app_state_sync', aviso(null, CLAUDIA, 'remove'), ferramentas())
  const daAgenda = linhas('whatsapp_contatos_do_celular').find((l) => l.wa_id === CLAUDIA)
  assert.equal(daAgenda.removido_em, '2026-10-20T16:00:00.000Z')
  assert.equal(conversa('sem-nada').nome_personalizado, 'Cláudia (filha da Dona Lourdes)')
})

await caso('contato bloqueado pela equipe: o historico dele nao entra; o que a equipe escreve entra', async () => {
  const { admin, linhas } = banco({
    whatsapp_conversations: [
      { id: 'conv-bloqueada', clinic_id: CLINICA, wa_id: CUIDADOR, patient_id: null, bloqueado_em: '2026-11-01T12:00:00.000Z' },
    ],
  })
  const feito = await C.tratarAvisoDoCelular(
    admin,
    'history',
    historico([
      { id: CUIDADOR, messages: [texto(CUIDADOR, 'wamid.K1', T0, 'Propaganda')] },
      { id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.K2', T0, 'Bom dia')] },
    ]),
    ferramentas(),
  )
  assert.equal(feito.bloqueadas, 1)
  assert.deepEqual(linhas('whatsapp_messages').map((m) => m.external_message_id), ['wamid.K2'])
  await C.tratarAvisoDoCelular(admin, 'smb_message_echoes', eco(CUIDADOR, 'wamid.K3', T0 + 10, 'Favor não enviar propaganda.'), ferramentas())
  assert.deepEqual(linhas('whatsapp_messages').map((m) => m.external_message_id), ['wamid.K2', 'wamid.K3'])
})

// ---------------------------------------------------------------------------
// Banco sem a migration: some so o recurso novo
// ---------------------------------------------------------------------------

await caso('banco sem a coluna origem: grava sem ela', async () => {
  const { admin, linhas } = banco({}, { semOrigem: true })
  const avisar = console.warn
  const avisos = []
  console.warn = (...a) => avisos.push(a.join(' '))
  try {
    const feito = await C.tratarAvisoDoCelular(admin, 'history', historico([{ id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.O1', T0, 'Oi'), texto(CLAUDIA, 'wamid.O2', T0 + 1, 'Tudo bem?')] }]), ferramentas())
    assert.equal(feito.gravadas, 2)
    assert.ok(linhas('whatsapp_messages').every((m) => !('origem' in m)))
    assert.ok(avisos.some((a) => a.includes('whatsapp_messages.origem')), 'avisa no log que gravou sem a coluna')
  } finally {
    console.warn = avisar
  }
})

await caso('banco sem a tabela da agenda: contato se perde sem derrubar; historico segue', async () => {
  const { admin, linhas } = banco({}, { semTabela: ['whatsapp_contatos_do_celular'] })
  const erros = []
  const avisar = console.error
  const alertar = console.warn
  console.error = (...a) => erros.push(a.join(' '))
  console.warn = () => {}
  try {
    const feito = await C.tratarAvisoDoCelular(
      admin,
      'smb_app_state_sync',
      valor({ state_sync: [{ type: 'contact', contact: { full_name: 'Cláudia', phone_number: CLAUDIA }, action: 'add', metadata: { timestamp: String(T0) } }] }),
      ferramentas(),
    )
    assert.equal(feito.contatos, 0)
    assert.ok(erros.some((e) => e.includes('agenda do celular')), 'grita no log')
    await C.tratarAvisoDoCelular(admin, 'history', historico([{ id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.T1', T0, 'Oi')] }]), ferramentas())
    assert.equal(linhas('whatsapp_messages').length, 1)
  } finally {
    console.error = avisar
    console.warn = alertar
  }
})

await caso('numero que nao e de clinica nenhuma: nada gravado', async () => {
  const { admin, linhas } = banco()
  const aviso = historico([{ id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.N1', T0, 'Oi')] }])
  aviso.metadata.phone_number_id = '999'
  const feito = await C.tratarAvisoDoCelular(admin, 'history', aviso, ferramentas())
  assert.equal(feito.clinica, null)
  assert.equal(linhas('whatsapp_messages').length, 0)
  assert.equal(linhas('whatsapp_conversations').length, 0)
})

await caso('corrida: o lote bate em mensagem gravada agora por outra entrega, e o resto entra', async () => {
  const { admin, linhas } = banco()
  const from = admin.from
  admin.from = (tabela) => {
    const pedido = from(tabela)
    if (tabela !== 'whatsapp_messages') return pedido
    const insert = pedido.insert.bind(pedido)
    pedido.insert = (valores) => {
      const lote = Array.isArray(valores) ? valores : [valores]
      if (lote.length > 1 || lote[0].external_message_id === 'wamid.C1') {
        return recusa({ code: '23505', message: 'duplicate key value violates unique constraint "whatsapp_messages_external_id_unique"' })
      }
      return insert(valores)
    }
    return pedido
  }
  const feito = await C.tratarAvisoDoCelular(
    admin,
    'history',
    historico([{ id: CLAUDIA, messages: [texto(CLAUDIA, 'wamid.C1', T0, 'Oi'), texto(CLAUDIA, 'wamid.C2', T0 + 1, 'Alguém?')] }]),
    ferramentas(),
  )
  assert.equal(feito.gravadas, 1)
  assert.deepEqual(linhas('whatsapp_messages').map((m) => m.external_message_id), ['wamid.C2'])
})

// ---------------------------------------------------------------------------
// O robo: eco cala, historico nao acorda ninguem
// ---------------------------------------------------------------------------

/**
 * A consulta que o meta-webhook faz antes de decidir se o robo responde: a
 * ultima mensagem de saida escrita por gente (automatic = false). O resultado
 * vai para equipeFalouRecentemente, de lembrete.ts.
 */
async function ultimaHumana(admin, conversaId) {
  const { data } = await admin
    .from('whatsapp_messages')
    .select('created_at')
    .eq('conversation_id', conversaId)
    .eq('direction', 'outbound')
    .eq('automatic', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}
const HORA = 3600 * 1000

await caso('mensagem digitada no celular cala o robo naquela conversa, pelas 12 horas de sempre', async () => {
  const { admin, linhas } = banco({
    whatsapp_conversations: [{ id: 'conv-claudia', clinic_id: CLINICA, wa_id: CLAUDIA, patient_id: null, last_message_at: null }],
    // O robo falou antes: a voz dele nao conta como gente.
    whatsapp_messages: [
      { id: 'm-robo', conversation_id: 'conv-claudia', direction: 'outbound', automatic: true, created_at: new Date((T0 - 600) * 1000).toISOString() },
    ],
  })
  assert.equal(L.equipeFalouRecentemente(await ultimaHumana(admin, 'conv-claudia'), T0 * 1000), false, 'antes do eco o robo responde')

  await C.tratarAvisoDoCelular(admin, 'smb_message_echoes', eco(CLAUDIA, 'wamid.Q1', T0, 'Já vejo a agenda e te respondo.'), ferramentas())
  const humana = await ultimaHumana(admin, 'conv-claudia')
  assert.equal(humana?.created_at, '2026-10-20T16:00:00.000Z')
  assert.equal(L.equipeFalouRecentemente(humana, T0 * 1000 + 1 * HORA), true, 'uma hora depois: a equipe esta atendendo, o robo fica quieto')
  assert.equal(L.equipeFalouRecentemente(humana, T0 * 1000 + 13 * HORA), false, 'depois de 12 horas o robo volta')
  // So aquela conversa: em outra, ninguem falou.
  assert.equal(await ultimaHumana(admin, 'conv-de-outra-pessoa'), null)
  assert.equal(linhas('whatsapp_messages').length, 2)
})

await caso('historico antigo nao cala o robo; e nem ele nem o eco acordam o robo ou avisam alguem', async () => {
  const { b, admin, linhas } = banco({
    patients: [{ id: 'pac-lourdes', clinic_id: CLINICA, name: 'Lourdes Teste', phone_digits: '13990000101', archived_at: null }],
  })
  // Qualquer chamada a rede seria uma mensagem saindo (resposta do robo,
  // lembrete, aviso de urgencia no celular da Dra.): nao pode haver nenhuma.
  const rede = []
  const fetchDeVerdade = globalThis.fetch
  globalThis.fetch = async (...args) => {
    rede.push(String(args[0]))
    throw new Error('a coexistencia nao fala com a rede')
  }
  try {
    const TRES_DIAS = 3 * 24 * 3600
    await C.tratarAvisoDoCelular(
      admin,
      'history',
      historico([
        {
          id: CLAUDIA,
          messages: [
            // Texto que, ao vivo, acenderia a urgencia e chamaria a equipe.
            texto(CLAUDIA, 'wamid.Z1', T0 - TRES_DIAS, 'URGENTE: minha mãe caiu e está com muita dor, preciso de ajuda'),
            texto(CONSULTORIO, 'wamid.Z2', T0 - TRES_DIAS + 60, 'Leve ao pronto-socorro agora.'),
            texto(CLAUDIA, 'wamid.Z3', T0 - TRES_DIAS + 120, '1'),
          ],
        },
      ]),
      ferramentas(),
    )
    await C.tratarAvisoDoCelular(
      admin,
      'smb_app_state_sync',
      valor({ state_sync: [{ type: 'contact', contact: { full_name: 'Cláudia', phone_number: CLAUDIA }, action: 'add', metadata: { timestamp: String(T0) } }] }),
      ferramentas(),
    )
    const [conversa] = linhas('whatsapp_conversations')
    assert.equal(L.equipeFalouRecentemente(await ultimaHumana(admin, conversa.id), T0 * 1000), false, 'resposta de tres dias atras nao segura o robo hoje')
    await C.tratarAvisoDoCelular(admin, 'smb_message_echoes', eco(CLAUDIA, 'wamid.Z4', T0, 'Como ela está hoje?'), ferramentas())
  } finally {
    globalThis.fetch = fetchDeVerdade
  }
  assert.deepEqual(rede, [], 'nenhuma mensagem saiu para ninguem')

  // So registro: nenhuma tabela alem da conversa, das mensagens e da agenda.
  const tabelasMexidas = [...new Set(b.gravado.map(([, tabela]) => tabela))].sort()
  assert.deepEqual(tabelasMexidas, ['whatsapp_contatos_do_celular', 'whatsapp_conversations', 'whatsapp_messages'])
  // Nada que a tela ou o robo leiam como "tem gente esperando": sem pedido de
  // atencao, sem motivo, sem "novas", sem etapa do robo.
  for (const [acao, tabela, valores] of b.gravado) {
    if (tabela !== 'whatsapp_conversations') continue
    assert.notEqual(valores.needs_attention, true, `${acao} nao acende a conversa`)
    assert.ok(!valores.attention_reason, `${acao} nao da motivo de atencao`)
    assert.ok(!valores.unread_count, `${acao} nao conta mensagem nova`)
    assert.ok(!('booking_state' in valores) && !('menu_sent_at' in valores), `${acao} nao mexe na etapa do robo`)
  }
  // E nenhuma mensagem automatica foi criada: so as quatro que vieram da Meta.
  assert.deepEqual(linhas('whatsapp_messages').map((m) => [m.external_message_id, m.automatic]), [
    ['wamid.Z1', false],
    ['wamid.Z2', false],
    ['wamid.Z3', false],
    ['wamid.Z4', false],
  ])
})

await caso('coexistencia.ts nao importa o robo, o alerta nem o envio', async () => {
  const fonte = lerComTrocas(join(SHARED, 'coexistencia.ts'))
  const importados = [...fonte.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
  assert.deepEqual(importados, ['./telefone-br.ts'], 'so registro: quem responde, lembra e avisa mora em outros arquivos')
  assert.ok(!/\bfetch\(/.test(fonte), 'nenhuma chamada a rede')
})

// ---------------------------------------------------------------------------
// O webhook
// ---------------------------------------------------------------------------

await caso('meta-webhook: os avisos do celular saem antes do robo, e o 131060 fica calado', async () => {
  const fonte = lerComTrocas(join(AQUI, '..', 'supabase', 'functions', 'meta-webhook', 'index.ts'))
  const rota = fonte.indexOf('if (campoDoCelular(change.field)) {')
  const filtro = fonte.indexOf("if (change.field !== 'messages') continue")
  assert.ok(rota > 0 && rota < filtro, 'a coexistencia e tratada antes de o webhook descartar o que nao e "messages"')
  const bloco = fonte.slice(rota, filtro)
  assert.match(bloco, /tratarAvisoDoCelular\(admin, String\(change\.field\), doCelular,/)
  // O bloco termina em `continue`: nada do que vem depois (robo, lembrete,
  // aviso de urgencia, aviso no celular da Dra.) roda para estes avisos.
  assert.match(bloco, /throw erro\n {10}\}\n {10}continue\n {8}\}/)
  for (const proibido of ['tratarConversa', 'atenderComAssistente', 'enviarAviso', 'avisarEquipe', 'postarNaMeta', 'whatsAppPelaApi']) {
    assert.ok(!bloco.includes(proibido), `${proibido} nao aparece no caminho da coexistencia`)
  }
  // O robo so e chamado depois, dentro do laco de mensagens ao vivo.
  assert.ok(fonte.indexOf('await tratarConversa(') > filtro)

  const reacao = fonte.indexOf("if (message.type === 'reaction') continue")
  const calado = fonte.indexOf('if (soNoCelular(message)) {')
  const registro = fonte.indexOf('registro.registrar(`message:${externalId}`')
  assert.ok(reacao > 0 && calado > reacao && calado < registro, 'o 131060 sai antes de registrar e de chamar o robo')

  // A regra que cala o robo continua lendo a mensagem humana de saida.
  assert.match(fonte, /\.eq\('direction', 'outbound'\)\n\s+\.eq\('automatic', false\)/)
  assert.ok(fonte.includes('equipeFalouRecentemente = equipeFalouHaPouco(ultimoHumanoResult.data)'))
})

conferirDesligar()
console.log(`Coexistencia: ${ok} casos passaram.`)
