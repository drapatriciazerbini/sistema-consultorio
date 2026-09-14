// Bateria completa do atendimento automatico do WhatsApp.
//
// Cada caso descreve o que a pessoa digita e o que a resposta PRECISA conter.
// A ideia nao e imprimir tela bonita: e falhar sozinho quando o robo mudar de
// comportamento sem querer.
//
// Como rodar:  npm run test:bot
//
// O banco aqui e falso e mora neste arquivo. Isso e proposital: o objetivo e
// exercitar as DECISOES do robo (o que responder, o que gravar, quando ficar
// calado), e nao o Supabase.
import { tratarConversa } from './atendimento.build.mjs'

// ---------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------

function fazerAdmin({
  unidades,
  slotsPorUnidade,
  falharSlots = false,
  erroInsert = null,
  remarcacoesAnteriores = 0,
  respostasProntas = [],
  telemedicina = { ativa: false, texto: '' },
}) {
  const conversa = {
    booking_state: null,
    booking_options: null,
    booking_unit_id: null,
    booking_patient_id: null,
    booking_replaces_id: null,
    menu_sent_at: null,
  }
  const marcadas = []
  const canceladas = []

  const chain = (resultado) => ({
    select: () => chain(resultado),
    eq: (_col, valor) => chain(resultado._porId ? { ...resultado, single: resultado._porId(valor) } : resultado),
    is: () => chain(resultado),
    order: () => chain(resultado),
    limit: () => chain(resultado),
    maybeSingle: async () => ({ data: resultado.single ?? null }),
    then: (r) => r({ data: resultado.list ?? [] }),
  })

  const admin = {
    from(tabela) {
      if (tabela === 'whatsapp_conversations') {
        return {
          update: (campos) => {
            Object.assign(conversa, campos)
            return { eq: async () => ({}) }
          },
        }
      }
      if (tabela === 'clinic_units') {
        return {
          select: () =>
            chain({
              list: unidades,
              single: unidades[0],
              _porId: (id) => unidades.find((u) => u.id === id) ?? null,
            }),
        }
      }
      if (tabela === 'clinics') {
        return { select: () => chain({ single: { timezone: 'America/Sao_Paulo' } }) }
      }
      // Respostas prontas: o que a clinica cadastrou para o robo responder
      // sozinho. Vazio por padrao - a maioria dos casos nao passa por aqui.
      if (tabela === 'bot_answers') {
        return { select: () => chain({ list: respostasProntas }) }
      }
      // Telemedicina: desligada por padrao, para os casos antigos continuarem
      // vendo so as unidades fisicas.
      if (tabela === 'clinic_settings') {
        return {
          select: () =>
            chain({
              single: {
                telemedicine_enabled: telemedicina.ativa,
                telemedicine_info_text: telemedicina.texto,
              },
            }),
        }
      }
      if (tabela === 'appointments') {
        return {
          // A consulta que vai ser substituida, para o contador de remarcacoes
          // saber de quantas vezes esta partindo.
          select: () => chain({ single: { reschedule_count: remarcacoesAnteriores } }),
          // A consulta marcada e lida de volta: e o id dela que a ficha de
          // dados (nome, nascimento, CPF...) usa para saber onde guardar.
          insert: (linha) => ({
            select: () => ({
              maybeSingle: async () => {
                if (erroInsert) return { data: null, error: erroInsert }
                marcadas.push(linha)
                return { data: { id: `consulta-${marcadas.length}` }, error: null }
              },
            }),
          }),
          update: (campos) => ({
            eq: (_c, valor) => ({
              eq: async () => {
                if (campos.status === 'cancelled') canceladas.push(valor)
                return { error: null }
              },
            }),
          }),
        }
      }
      throw new Error('tabela nao prevista: ' + tabela)
    },
    async rpc(nome, args) {
      if (nome === 'liberar_reservas_vencidas') return { data: 0, error: null }
      if (nome === 'available_slots') {
        if (falharSlots) {
          return { data: null, error: { code: '42501', message: 'permission denied for table clinics' } }
        }
        return { data: slotsPorUnidade[args.p_unit_id] ?? [], error: null }
      }
      throw new Error('rpc nao prevista: ' + nome)
    },
  }
  return { admin, conversa, marcadas, canceladas }
}

const TRES_UNIDADES = [
  { id: 'u-santos', name: 'Liferty · Santos', address: 'Av. Ana Costa, 100' },
  { id: 'u-andre', name: 'Livance · Santo André', address: 'Rua X, 20' },
  // Nome longo de proposito: 30 caracteres, igual ao da unidade real. Foi ele
  // que estourou o limite de 24 da Meta e fez a lista chegar sem botao.
  { id: 'u-vila', name: 'Livance Ibirapuera - São Paulo', address: 'Rua Y, 30' },
]
const UMA_UNIDADE = [TRES_UNIDADES[0]]

const diasSantos = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-07', '2026-09-08']
const horasManha = ['11:00', '11:40', '12:20', '13:00', '13:40', '14:20'] // UTC -> 08h a 11h20 BRT
const SLOTS_CHEIOS = {
  'u-santos': diasSantos.flatMap((d) =>
    horasManha.map((h) => ({ slot_start: `${d}T${h}:00Z`, slot_end: `${d}T${h}:40Z` })),
  ),
  'u-andre': [],
  'u-vila': [],
}
const SLOTS_VAZIOS = { 'u-santos': [], 'u-andre': [], 'u-vila': [] }

const TEXTOS = {
  saudacao: 'Olá! Aqui é o consultório do Dr. Marcello Ruiz, gastropediatra.',
  saudacaoConhecida: 'Olá, {nome}! Aqui é o consultório do Dr. Marcello Ruiz.',
  informacoes: 'O valor da consulta é R$ 450,00.\n13 3273-6828',
}

// Ana tem a ficha completa: e o paciente de anos, que nao deve ser
// interrogado de novo. Pedro so tem o nome, e serve para exercitar a ficha.
const ANA = {
  id: 'p1',
  name: 'Ana Paula Souza',
  nascimento: '2019-03-12',
  responsavel: 'Marina Souza',
  cpf: '39053344705',
  email: 'marina@exemplo.com',
}
const PEDRO = { id: 'p2', name: 'Pedro Souza' }

// ---------------------------------------------------------------
// Motor de casos
// ---------------------------------------------------------------

let passou = 0
const falhas = []
const achados = []

/**
 * `passos` e uma lista de [mensagem, esperado].
 * `esperado` pode ser:
 *   - string  -> a resposta precisa conter esse trecho
 *   - array   -> precisa conter todos
 *   - null    -> o robo precisa ficar em silencio
 */
async function caso(titulo, passos, opcoes = {}) {
  const { admin, conversa, marcadas, canceladas } = fazerAdmin({
    unidades: opcoes.unidades ?? TRES_UNIDADES,
    slotsPorUnidade: opcoes.slots ?? SLOTS_CHEIOS,
    falharSlots: opcoes.falharSlots,
    erroInsert: opcoes.erroInsert,
    remarcacoesAnteriores: opcoes.remarcacoesAnteriores ?? 0,
    respostasProntas: opcoes.respostasProntas ?? [],
    telemedicina: opcoes.telemedicina ?? { ativa: false, texto: '' },
  })

  const transcricao = []
  let ultimoToque = { resposta: '', botoes: undefined, lista: undefined }

  // O webhook real relê as consultas futuras a cada mensagem, entao uma que foi
  // cancelada some da lista. O banco falso precisa fazer o mesmo, senao o teste
  // pergunta ao robo sobre uma consulta que ja nao existe.
  let consultas = opcoes.consultas ?? []

  for (const [texto, esperado] of passos) {
    consultas = consultas.filter((c) => !canceladas.includes(c.id))
    const r = await tratarConversa({
      admin,
      clinicId: 'c1',
      conversationId: 'conv1',
      estadoAtual: conversa.booking_state,
      opcoesAtuais: conversa.booking_options,
      unidadeEmAndamento: conversa.booking_unit_id,
      modalidadeEmAndamento: conversa.booking_modality ?? null,
      pacienteEmAndamento: conversa.booking_patient_id ?? null,
      consultas,
      consultaASubstituir: conversa.booking_replaces_id ?? null,
      // Quantas respostas prontas o robo ja deu nesta espera pela equipe. Sai
      // do banco falso, como no webhook de verdade, para o limite de tres ser
      // contado entre uma mensagem e outra.
      respostasNaEspera: conversa.auto_replies_while_waiting ?? 0,
      podeIniciarMenu: opcoes.podeIniciarMenu ?? true,
      texto,
      telefone: opcoes.telefone ?? '5511999999999',
      pacientes: opcoes.pacientes ?? [],
      nomeDoPerfil: opcoes.nomeDoPerfil ?? 'Paula Medina',
      textos: opcoes.textos ?? TEXTOS,
    })

    const resposta = r?.resposta ?? null
    ultimoToque = { resposta: r?.resposta ?? '', botoes: r?.botoes, lista: r?.lista }
    transcricao.push(`  > ${texto}\n    ${resposta ? resposta.replace(/\n/g, '\n    ') : '(silêncio)'}`)

    if (esperado === null) {
      if (resposta !== null) {
        falhas.push(`${titulo} | "${texto}" deveria ser silêncio, veio: ${resposta.slice(0, 60)}`)
      } else passou++
      continue
    }

    const trechos = Array.isArray(esperado) ? esperado : [esperado]
    for (const trecho of trechos) {
      if (resposta && resposta.includes(trecho)) passou++
      else {
        falhas.push(
          `${titulo} | "${texto}" deveria conter "${trecho}"\n     veio: ${(resposta ?? '(silêncio)').slice(0, 140)}`,
        )
      }
    }
  }

  if (opcoes.verificar) {
    opcoes.verificar({ marcadas, canceladas, conversa, transcricao, titulo, ultimoToque })
  }
  return { marcadas, canceladas, conversa, transcricao }
}

// ---------------------------------------------------------------
// 1. Menu
// ---------------------------------------------------------------

await caso('Primeiro contato mostra o menu', [
  ['Oi', ['Aqui é o consultório', '*1* 💬 Dúvidas', '*2* 🗓️ Marcar', '*3* 🗣️ Falar com alguém', '*4* 🔄 Ver, remarcar']],
])

await caso('Paciente cadastrado é chamado pelo nome', [['Oi', 'Olá, Ana!']], { pacientes: [ANA] })

await caso('Dois pacientes no telefone: saudação sem nome', [['Oi', 'Aqui é o consultório']], {
  pacientes: [ANA, PEDRO],
})

// Com mais de uma unidade, a opcao 1 pergunta onde antes de responder: o
// valor de Santos nao e o de Sao Paulo. O texto geral da clinica continua
// valendo para a unidade que nao tem texto proprio.
await caso('Opção 1 pergunta a unidade e depois entrega as informações', [
  ['Oi', 'Como podemos ajudar'],
  ['1', ['Para qual atendimento', '*1* Liferty · Santos', '*3* Livance Ibirapuera']],
  ['1', ['R$ 450,00', 'ver outra unidade']],
])

await caso('Opção 1 com uma unidade só responde direto', [
  ['Oi', 'Como podemos ajudar'],
  ['1', ['R$ 450,00', 'ver todas as opções']],
], { unidades: UMA_UNIDADE })

// O fecho comum (telefones, horario, como agendar) vai no fim do texto de
// qualquer unidade: e o campo antigo de informacoes, editado uma vez so.
await caso('O fecho comum vai no fim do texto da unidade', [
  ['Oi', 'Como podemos ajudar'],
  ['1', 'Para qual atendimento'],
  ['3', ['R$ 550,00', '13 3273-6828']],
], {
  unidades: [TRES_UNIDADES[0], TRES_UNIDADES[1], { ...TRES_UNIDADES[2], info_text: '*Consulta em São Paulo: R$ 550,00.*' }],
})

await caso('Texto próprio da unidade vence o texto geral', [
  ['Oi', 'Como podemos ajudar'],
  ['1', 'Para qual atendimento'],
  ['3', ['R$ 550,00', 'Vila Clementino']],
], {
  unidades: [
    TRES_UNIDADES[0],
    TRES_UNIDADES[1],
    { ...TRES_UNIDADES[2], info_text: '*Consulta em São Paulo: R$ 550,00.*\nVila Clementino.' },
  ],
})

await caso('Opção 3 chama a equipe e sinaliza', [
  ['Oi', 'Como podemos ajudar'],
  ['3', ['direcionando você para um atendente', 'segunda a sexta']],
  ['tenho uma dúvida', null],
])

await caso('Resposta sem sentido no menu não deixa no vácuo', [
  ['Oi', 'Como podemos ajudar'],
  ['blablabla', ['Não entendi', '*1* 💬 Dúvidas']],
  ['7', ['Não entendi', '*2* 🗓️ Marcar']],
])

await caso('MENU volta ao início de qualquer etapa', [
  ['agendar', 'Em qual unidade'],
  ['1', 'Datas disponíveis'],
  ['MENU', 'Como podemos ajudar'],
])

await caso('0 também volta ao menu', [
  ['agendar', 'Em qual unidade'],
  ['0', 'Como podemos ajudar'],
])

await caso('ATENDENTE funciona no meio do agendamento', [
  ['agendar', 'Em qual unidade'],
  ['atendente', 'direcionando você'],
])

await caso('CANCELAR no meio do fluxo devolve ao menu', [
  ['agendar', 'Em qual unidade'],
  ['cancelar', ['parei por aqui', '*1* 💬 Dúvidas']],
])

// ---------------------------------------------------------------
// 2. Agendamento
// ---------------------------------------------------------------

await caso(
  'Cadastrado marca direto e a consulta sai confirmada',
  [
    ['Oi', 'Olá, Ana!'],
    ['2', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', ['Consulta marcada!', 'Av. Ana Costa', 'confirmar sua presença']],
  ],
  {
    pacientes: [ANA],
    verificar: ({ marcadas, titulo }) => {
      const m = marcadas[0]
      if (!m) return falhas.push(`${titulo} | nenhuma consulta gravada`)
      if (m.confirmed_by_clinic !== true) falhas.push(`${titulo} | deveria nascer confirmada`)
      else passou++
      if (m.hold_expires_at !== null) falhas.push(`${titulo} | cadastrado não deve ter reserva provisória`)
      else passou++
      if (m.patient_id !== 'p1') falhas.push(`${titulo} | patient_id errado: ${m.patient_id}`)
      else passou++
    },
  },
)

await caso(
  'Sem cadastro também sai com a consulta confirmada na hora',
  [
    ['Oi', 'Aqui é o consultório'],
    ['2', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    // Nada de "solicitacao": quem chega pelo WhatsApp e quem menos conhece a
    // clinica, e sai daqui com o horario garantido. O comprovante inteiro vem
    // depois da ficha, para ser a ultima coisa da conversa.
    ['1', ['está guardado', 'perguntas rápidas', 'nome completo do paciente']],
  ],
  {
    verificar: ({ marcadas, titulo }) => {
      const m = marcadas[0]
      if (!m) return falhas.push(`${titulo} | nenhuma consulta gravada`)
      if (m.confirmed_by_clinic !== true) falhas.push(`${titulo} | deveria nascer confirmada`)
      else passou++
      if (m.hold_expires_at !== null) falhas.push(`${titulo} | não deve mais reservar provisoriamente`)
      else passou++
      if (m.contact_name !== 'Paula Medina')
        falhas.push(`${titulo} | deveria usar o nome do WhatsApp, veio "${m.contact_name}"`)
      else passou++
    },
  },
)

await caso(
  'Dois irmãos: pergunta e grava no escolhido',
  [
    ['Oi', 'Como podemos ajudar'],
    ['2', ['Para quem é a consulta', '*1* Ana Paula Souza', '*2* Pedro Souza', 'Digite *9*']],
    ['2', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['2', 'está guardado'],
  ],
  {
    pacientes: [ANA, PEDRO],
    verificar: ({ marcadas, titulo }) => {
      const m = marcadas[0]
      if (m?.patient_id !== 'p2') falhas.push(`${titulo} | gravou no paciente errado: ${m?.patient_id}`)
      else passou++
      if (m?.contact_name !== 'Pedro Souza')
        falhas.push(`${titulo} | nome errado na consulta: ${m?.contact_name}`)
      else passou++
    },
  },
)

await caso(
  'Uma unidade só: pula a pergunta de unidade',
  [
    ['Oi', 'Como podemos ajudar'],
    ['2', 'Datas disponíveis'],
  ],
  { unidades: UMA_UNIDADE },
)

await caso('Unidade sem agenda: continua na lista, não trava', [
  ['agendar', 'Em qual unidade'],
  ['2', ['não temos horários abertos em Livance · Santo André', 'outra unidade da lista']],
  ['1', 'Datas disponíveis'],
])

await caso(
  'Nenhuma unidade com agenda: manda para a equipe',
  [
    ['agendar', ['não temos horários abertos para agendamento', '*9*']],
  ],
  { slots: SLOTS_VAZIOS },
)

await caso(
  'Banco recusando a consulta: admite a falha em vez de mentir',
  [['agendar', ['Tive um problema para consultar a agenda', 'Já avisei a nossa equipe']]],
  { falharSlots: true },
)

await caso(
  'Horário tomado por outro entre a lista e a escolha',
  [
    ['agendar', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', ['acabou de ser ocupado', 'Digite *2* para ver os horários atualizados']],
  ],
  { erroInsert: { code: '23505' } },
)

await caso(
  'Falha inesperada ao gravar: nao promete o que nao cumpriu',
  [
    ['agendar', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', ['Não consegui concluir o agendamento', 'equipe']],
  ],
  { erroInsert: { code: '42501', message: 'boom' } },
)

await caso('VOLTAR sobe um nível de cada vez', [
  ['agendar', 'Em qual unidade'],
  ['1', 'Datas disponíveis'],
  ['1', 'Horários de'],
  ['VOLTAR', 'Datas disponíveis'],
  ['VOLTAR', 'Em qual unidade'],
  ['VOLTAR', 'Como podemos ajudar'],
])

await caso(
  'VOLTAR com dois irmãos sobe até a escolha do paciente',
  [
    ['agendar', 'Para quem é a consulta'],
    ['1', 'Em qual unidade'],
    ['VOLTAR', 'Para quem é a consulta'],
    ['VOLTAR', 'Como podemos ajudar'],
  ],
  { pacientes: [ANA, PEDRO] },
)

await caso('Número fora da faixa em cada etapa', [
  ['agendar', 'Em qual unidade'],
  ['99', ['Não entendi', 'número da unidade']],
  ['1', 'Datas disponíveis'],
  ['99', ['Não entendi', 'número do dia']],
  ['1', 'Horários de'],
  ['99', ['Não entendi', 'número do horário']],
])

// ---------------------------------------------------------------
// 3. Silêncio
// ---------------------------------------------------------------

// Quem escolhe a opcao 3 e quem realmente cala o robo - e so ele. A bandeira de
// atencao deixou de silenciar em 30/08/2026: ela acende tambem para quem
// cancelou sozinho, e essa pessoa nao esta esperando ninguem falar.
await caso('Quem pediu atendente: robô não fala por cima', [
  ['Oi', 'Como podemos ajudar'],
  ['3', 'direcionando você'],
  ['tudo bem?', null],
  ['e aí?', null],
])


await caso('Mas MENU fura o silêncio e o fluxo volta a responder', [
  ['Oi', 'Como podemos ajudar'],
  ['3', 'direcionando você'],
  ['tudo bem?', null],
  ['MENU', 'Como podemos ajudar'],
  ['2', 'Em qual unidade'],
])


await caso('Respondendo acompanhamento: nada de menu', [['Estou bem, obrigada', null]], {
  podeIniciarMenu: false,
})

await caso(
  'Mas quem pede para agendar é atendido mesmo assim',
  [['agendar', 'Em qual unidade']],
  { podeIniciarMenu: false },
)

// ---------------------------------------------------------------
// 4. Bordas de texto
// ---------------------------------------------------------------

await caso('Aceita "1." e "opção 2"', [
  ['Oi', 'Como podemos ajudar'],
  ['1.', 'Para qual atendimento'],
  ['1', 'R$ 450,00'],
  ['opção 2', 'Em qual unidade'],
])

await caso('Mensagem de áudio não quebra o fluxo', [
  ['Oi', 'Como podemos ajudar'],
  ['[audio]', 'Não entendi'],
])

await caso(
  'Sem textos configurados, ainda existe uma saudação',
  [['Oi', ['Aqui é o consultório do Dr. Marcello Ruiz, Gastroenterologista Pediátrico', '*1* 💬 Dúvidas']]],
  { textos: { saudacao: '', saudacaoConhecida: '', informacoes: '' } },
)

await caso(
  'Opção 1 sem texto cadastrado não devolve mensagem vazia',
  [
    ['Oi', 'Como podemos ajudar'],
    ['1', '*1* 💬 Dúvidas'],
  ],
  { textos: { ...TEXTOS, informacoes: '' }, unidades: UMA_UNIDADE },
)

// ---------------------------------------------------------------
// 4b. Minha consulta (opcao 4)
// ---------------------------------------------------------------

const CONSULTA_ANA = {
  id: 'a1',
  inicio: '2026-09-01T11:00:00Z',
  unidade: 'Liferty · Santos',
  endereco: 'Av. Ana Costa, 100',
  paciente: 'Ana Paula Souza',
  confirmada: true,
}

await caso('Sem consulta marcada, a opção 4 não deixa no vácuo', [
  ['Oi', 'Como podemos ajudar'],
  ['4', ['Não encontrei nenhuma consulta marcada', 'Digite *2* para agendar']],
])

await caso(
  'Com consulta marcada, a opção 4 mostra os dados',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', ['Sua consulta', 'Ana Paula Souza', 'Liferty · Santos', 'CANCELAR', 'REMARCAR']],
  ],
  { consultas: [CONSULTA_ANA] },
)

await caso(
  'Cancelar exige confirmação explícita',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
    ['CANCELAR', ['Confirma o cancelamento', 'Responda SIM']],
    ['não', ['continua marcada', '*1* 💬 Dúvidas']],
  ],
  {
    consultas: [CONSULTA_ANA],
    verificar: ({ canceladas, titulo }) => {
      if (canceladas.length > 0) falhas.push(`${titulo} | cancelou sem o SIM`)
      else passou++
    },
  },
)

await caso(
  'Cancelar com SIM desmarca e acende a conversa',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
    ['CANCELAR', 'Responda SIM'],
    ['SIM', ['Consulta cancelada', 'digite 2']],
  ],
  {
    consultas: [CONSULTA_ANA],
    verificar: ({ canceladas, titulo }) => {
      if (canceladas[0] !== 'a1') falhas.push(`${titulo} | não cancelou a consulta certa`)
      else passou++
    },
  },
)

await caso(
  'Remarcar leva a contagem adiante em vez de zerar',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
    ['REMARCAR', 'Vamos remarcar'],
    ['SIM', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', 'Consulta remarcada!'],
  ],
  {
    consultas: [CONSULTA_ANA],
    pacientes: [ANA],
    // A antiga ja tinha trocado de data duas vezes.
    remarcacoesAnteriores: 2,
    verificar: ({ marcadas, titulo }) => {
      const nova = marcadas[0] ?? {}
      // Remarcar cria linha nova e cancela a antiga. Sem carregar a contagem, a
      // terceira troca de data apareceria na agenda como se fosse a primeira.
      if (nova.reschedule_count !== 3) {
        falhas.push(`${titulo} | esperava contagem 3, veio ${nova.reschedule_count}`)
      } else passou++
      if (nova.rescheduled_from !== 'a1') {
        falhas.push(`${titulo} | perdeu o vínculo com a consulta anterior`)
      } else passou++
    },
  },
)

await caso(
  'Marcação nova nasce com contagem zero',
  [
    ['agendar', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', 'Consulta marcada!'],
  ],
  {
    pacientes: [ANA],
    verificar: ({ marcadas, titulo }) => {
      const nova = marcadas[0] ?? {}
      if (nova.reschedule_count !== 0 || nova.rescheduled_from !== null) {
        falhas.push(`${titulo} | consulta nova não deveria contar remarcação`)
      } else passou++
    },
  },
)

await caso(
  'Remarcar so cancela a antiga depois que a nova entra',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
    ['REMARCAR', ['Vamos remarcar', 'só será cancelada depois']],
    ['SIM', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', 'Consulta remarcada!'],
  ],
  {
    consultas: [CONSULTA_ANA],
    pacientes: [ANA],
    verificar: ({ marcadas, canceladas, titulo }) => {
      if (marcadas.length !== 1) falhas.push(`${titulo} | deveria marcar exatamente uma`)
      else passou++
      if (canceladas[0] !== 'a1') falhas.push(`${titulo} | não cancelou a antiga`)
      else passou++
    },
  },
)

await caso(
  'Quem já tem consulta é avisado antes de criar outra',
  [
    ['Oi', 'Como podemos ajudar'],
    ['2', ['Você já tem uma consulta marcada', '1 - Remarcar', '2 - Marcar mais uma']],
  ],
  { consultas: [CONSULTA_ANA], pacientes: [ANA] },
)

await caso(
  'Escolhendo "marcar mais uma", segue o fluxo normal',
  [
    ['Oi', 'Como podemos ajudar'],
    ['2', 'Você já tem uma consulta'],
    ['2', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', 'Consulta marcada!'],
  ],
  {
    consultas: [CONSULTA_ANA],
    pacientes: [ANA],
    verificar: ({ canceladas, titulo }) => {
      if (canceladas.length > 0) falhas.push(`${titulo} | não devia cancelar a existente`)
      else passou++
    },
  },
)

// Regressao de 30/08/2026: o cancelamento acende a bandeira de atencao, e a
// bandeira silencia o robo quando nao ha etapa aberta. A mensagem prometia
// "digite 2" e o robo emudecia. O menu tem de continuar ativo depois de toda
// mensagem que oferece um numero.
await caso(
  'Depois de cancelar, o "2" prometido continua funcionando',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
    ['CANCELAR', 'Responda SIM'],
    ['SIM', ['Consulta cancelada', 'digite 2']],
    ['2', 'Em qual unidade'],
  ],
  { consultas: [CONSULTA_ANA], pacientes: [ANA] },
)

await caso(
  'Depois de cancelar, um "Oi" novo não cai no vácuo',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
    ['CANCELAR', 'Responda SIM'],
    ['SIM', 'Consulta cancelada'],
    ['Oi', ['*1* 💬 Dúvidas', '*2* 🗓️ Marcar']],
  ],
  { consultas: [CONSULTA_ANA], pacientes: [ANA] },
)

await caso(
  'Horário tomado por outro: o "2" prometido também funciona',
  [
    ['agendar', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
    ['1', 'Digite *2* para ver os horários atualizados'],
    ['2', 'Em qual unidade'],
  ],
  { erroInsert: { code: '23505' } },
)

// ---------------------------------------------------------------
// 4c. Botoes e listas tocaveis
//
// A Meta recusa a mensagem INTEIRA quando um limite estoura, entao os limites
// sao verificados aqui: 3 botoes, 10 linhas, titulo de botao com 20, linha com
// 24, descricao com 72.
// ---------------------------------------------------------------

/**
 * Toda lista precisa terminar com a volta ao menu.
 *
 * Sem ela, quem so toca fica preso: o texto oferece "0", mas quem nao le o
 * texto - que e justamente quem usa a lista - nao tem por onde sair.
 */
function conferirSaida(toque, titulo) {
  const linhas = toque?.lista?.linhas
  if (!linhas) return
  // O proprio menu nao precisa de linha para voltar ao menu.
  if (toque.lista.rotulo === 'Ver opções') return
  const fim = linhas[linhas.length - 1]
  if (fim.id !== '0') falhas.push(`${titulo} | lista sem saída tocável no fim (último id: ${fim.id})`)
  else passou++
}

function conferirLimites(toque, titulo) {
  conferirSaida(toque, titulo)
  for (const b of toque.botoes ?? []) {
    if (b.titulo.length > 20) falhas.push(`${titulo} | botão "${b.titulo}" passa de 20 caracteres`)
    else passou++
  }
  if ((toque.botoes ?? []).length > 3) falhas.push(`${titulo} | mais de 3 botões`)

  const lista = toque.lista
  if (lista) {
    if (lista.rotulo.length > 20) falhas.push(`${titulo} | rótulo "${lista.rotulo}" passa de 20`)
    else passou++
    if (lista.linhas.length > 10) falhas.push(`${titulo} | lista com mais de 10 linhas`)
    else passou++
    for (const l of lista.linhas) {
      if (l.titulo.length > 24) falhas.push(`${titulo} | linha "${l.titulo}" passa de 24`)
      else passou++
      if ((l.descricao ?? '').length > 72) falhas.push(`${titulo} | descrição longa em "${l.titulo}"`)
      else passou++
    }
  }
}

await caso(
  'Menu vem como lista tocável com as quatro opções',
  [['Oi', 'Como podemos ajudar']],
  {
    verificar: ({ ultimoToque, titulo }) => {
      const linhas = ultimoToque.lista?.linhas ?? []
      if (linhas.length !== 4) falhas.push(`${titulo} | esperava 4 linhas, veio ${linhas.length}`)
      else passou++
      // Os ids precisam ser exatamente o que o robô aceita digitado.
      if (linhas.map((l) => l.id).join(',') !== '1,2,3,4') {
        falhas.push(`${titulo} | ids fora do padrão: ${linhas.map((l) => l.id).join(',')}`)
      } else passou++
      conferirLimites(ultimoToque, titulo)
    },
  },
)

await caso(
  'Tocar na lista funciona igual a digitar o número',
  [
    ['Oi', 'Como podemos ajudar'],
    // O webhook manda o id do toque no lugar do texto - aqui é o mesmo "2".
    ['2', 'Em qual unidade'],
  ],
  {
    verificar: ({ ultimoToque, titulo }) => {
      if (!ultimoToque.lista) falhas.push(`${titulo} | unidade deveria vir como lista`)
      else passou++
      conferirLimites(ultimoToque, titulo)
    },
  },
)

await caso(
  'Minha consulta oferece três botões',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
  ],
  {
    consultas: [CONSULTA_ANA],
    verificar: ({ ultimoToque, titulo }) => {
      const ids = (ultimoToque.botoes ?? []).map((b) => b.id).join(',')
      if (ids !== 'REMARCAR,CANCELAR,MENU') falhas.push(`${titulo} | botões inesperados: ${ids}`)
      else passou++
      conferirLimites(ultimoToque, titulo)
    },
  },
)

await caso(
  'Confirmação de cancelamento vira sim/não tocável',
  [
    ['Oi', 'Como podemos ajudar'],
    ['4', 'Sua consulta'],
    ['CANCELAR', 'Responda SIM'],
  ],
  {
    consultas: [CONSULTA_ANA],
    verificar: ({ ultimoToque, titulo }) => {
      const ids = (ultimoToque.botoes ?? []).map((b) => b.id).join(',')
      if (ids !== 'SIM,MENU') falhas.push(`${titulo} | botões inesperados: ${ids}`)
      else passou++
      conferirLimites(ultimoToque, titulo)
    },
  },
)

await caso(
  'Dia vem como lista, e horário também quando cabe',
  [
    ['agendar', 'Em qual unidade'],
    ['1', 'Datas disponíveis'],
    ['1', 'Horários de'],
  ],
  {
    verificar: ({ ultimoToque, titulo }) => {
      const linhas = ultimoToque.lista?.linhas ?? []
      // 6 horarios + a linha de volta que toda lista carrega no fim
      // Seis horarios mais as duas saidas: falar com a equipe e voltar ao menu.
      if (linhas.length !== 8) falhas.push(`${titulo} | esperava 6 horários + 2 saídas, veio ${linhas.length}`)
      else passou++
      conferirLimites(ultimoToque, titulo)
    },
  },
)

// ---------------------------------------------------------------
// 5. Coisas que quero OBSERVAR, nao afirmar
// ---------------------------------------------------------------

const r1 = await caso('Paciente quer cancelar consulta fora do lembrete', [['cancelar minha consulta', []]])
achados.push(
  'Cancelar/remarcar fora da janela do lembrete:\n' +
    r1.transcricao.join('\n'),
)

const r2 = await caso('Paciente pergunta quando é a consulta dele', [['quando é minha consulta?', []]])
achados.push('Consultar a propria consulta:\n' + r2.transcricao.join('\n'))

const r3 = await caso('Responde com o horário em vez do número da linha', [
  ['agendar', []],
  ['1', []],
  ['1', []],
  ['08:40', []],
])
achados.push('Responder "08:40" em vez de "2":\n' + r3.transcricao.slice(-1).join('\n'))

// ---------------------------------------------------------------------------
// O 9 como saida universal
//
// Ele so pode significar "falar com a equipe" porque nenhuma lista chega a nove
// opcoes. Se um dia alguem aumentar MAX_DIAS ou MAX_HORARIOS_DIA, e aqui que
// isso vai doer, e nao numa conversa real em que o paciente pediu o nono
// horario e caiu na fila da secretaria.
// ---------------------------------------------------------------------------

await caso('O 9 chama a equipe a partir do menu', [
  ['Oi', 'Como podemos ajudar'],
  ['9', 'atendente da clínica'],
])

await caso('O 9 chama a equipe no meio do agendamento', [
  ['agendar', 'Em qual unidade'],
  ['9', 'atendente da clínica'],
])

await caso('Unidade de nome longo continua com botão e sem estourar o limite', [
  ['Oi', 'Como podemos ajudar'],
  ['2', 'Em qual unidade'],
])

// ---------------------------------------------------------------------------
// Respostas prontas
//
// O robo responde a pergunta escrita quando a clinica cadastrou aquele assunto.
// Tres coisas precisam continuar valendo: acertar o assunto, calar a boca em
// assunto clinico, e nao inventar quando nada bate.
// ---------------------------------------------------------------------------

const TELE = { ativa: true, texto: '*Telemedicina: R$ 450,00.* Retorno presencial em 30 dias.' }

const RESPOSTAS = [
  {
    id: 'r1',
    subject: 'Valor e pagamento',
    keywords: ['valor', 'quanto', 'custa', 'preco', 'pix', 'cartao', 'pagamento'],
    answer: 'A consulta particular custa R$ 450,00. Aceitamos pix e cartão.',
  },
  {
    id: 'r2',
    subject: 'Convênios',
    keywords: ['convenio', 'plano', 'reembolso', 'carteirinha'],
    answer: 'O atendimento é particular. Emitimos recibo para reembolso.',
  },
]

await caso('Pergunta de valor recebe a resposta pronta', [
  ['Quanto custa a consulta?', 'custa R$ 450,00'],
], { respostasProntas: RESPOSTAS })

await caso('Acento e plural não atrapalham', [
  ['Vocês atendem convênios?', 'particular. Emitimos recibo'],
], { respostasProntas: RESPOSTAS })

await caso('Depois da resposta pronta o 2 ainda marca consulta', [
  ['Qual o valor?', 'custa R$ 450,00'],
  ['2', 'Em qual unidade'],
], { respostasProntas: RESPOSTAS })

await caso('Pergunta clínica não é respondida, mas recebe o caminho certo', [
  ['Meu filho está com dor de barriga, posso dar dipirona?', ['quem responde é o Dr. Marcello', 'Digite *3*']],
], { respostasProntas: RESPOSTAS })

await caso('Palavra de valor junto de sintoma não recebe o preço', [
  ['Ele está com febre, quanto custa a consulta?', 'quem responde é o Dr. Marcello'],
], { respostasProntas: RESPOSTAS })

await caso('Assunto que ninguém cadastrou cai no menu, sem inventar', [
  ['Vocês têm convênio com o meu banco de leite?', 'particular. Emitimos recibo'],
], { respostasProntas: RESPOSTAS })

await caso('Sintoma junto de "quero marcar" continua podendo marcar pelo menu', [
  ['oi, meu filho tem refluxo, queria marcar uma consulta', 'quem responde é o Dr. Marcello'],
  ['2', 'Em qual unidade'],
], { respostasProntas: RESPOSTAS })

await caso('Sem nada cadastrado, tudo segue como antes', [
  ['Quanto custa a consulta?', 'Como podemos ajudar'],
])

await caso('Pergunta escrita depois do menu também é respondida', [
  ['Oi', 'Como podemos ajudar'],
  ['e o valor?', 'custa R$ 450,00'],
], { respostasProntas: RESPOSTAS })

// ---------------------------------------------------------------
// Resposta pronta enquanto a equipe nao chega
// ---------------------------------------------------------------

// A fila pode durar a noite inteira, e nela a pessoa escreve as duvidas de
// sempre. Tres respostas prontas ela recebe; da quarta em diante o robo cala.
// Se tres textos prontos nao resolveram, o quarto tambem nao resolve.
await caso('Esperando a equipe: três respostas prontas, depois silêncio', [
  ['Oi', 'Como podemos ajudar'],
  ['3', 'direcionando você'],
  ['Vocês atendem convênio?', ['particular', 'continua na fila']],
  ['Qual o valor?', ['R$ 450,00', 'continua na fila']],
  ['Aceitam cartão?', 'continua na fila'],
  ['E o reembolso do plano?', null],
], { respostasProntas: RESPOSTAS })

// A resposta pronta nao tira a pessoa da fila: a etapa continua 'atendente' e a
// equipe continua devendo resposta. Por isso o "bom dia" seguinte cai no
// silencio, e nao no menu.
await caso('Resposta pronta na fila não solta a conversa da equipe', [
  ['Oi', 'Como podemos ajudar'],
  ['3', 'direcionando você'],
  ['Vocês atendem convênio?', 'continua na fila'],
  ['bom dia', null],
], { respostasProntas: RESPOSTAS })

// Com alguem da equipe escrevendo agora, nem palavra-chave aparece: seria o
// robo falando por cima da atendente.
await caso('Equipe conversando: o robô não responde nem palavra-chave', [
  ['Vocês atendem convênio?', null],
], { respostasProntas: RESPOSTAS, podeIniciarMenu: false })

// ---------------------------------------------------------------
// Pergunta no meio de uma escolha
// ---------------------------------------------------------------

// Quem escreve "convenio" quando o robo espera um numero nao errou: mudou de
// assunto. A resposta vem primeiro e a pergunta da etapa e repetida abaixo.
await caso('Pergunta no meio da escolha da unidade é respondida', [
  ['Oi', 'Como podemos ajudar'],
  ['2', 'Em qual unidade'],
  ['Vocês atendem convênio?', ['particular', 'número da unidade']],
  ['1', 'Datas disponíveis'],
], { respostasProntas: RESPOSTAS })

await caso('E também no meio da escolha do dia e do horário', [
  ['Oi', 'Como podemos ajudar'],
  ['2', 'Em qual unidade'],
  ['1', 'Datas disponíveis'],
  ['Qual o valor?', ['R$ 450,00', 'número do dia']],
  ['1', 'Horários de'],
  ['Aceitam cartão?', ['R$ 450,00', 'número do horário']],
  ['1', 'nome completo do paciente'],
], { respostasProntas: RESPOSTAS })

// Sintoma continua sem resposta automatica, mesmo no meio de uma escolha: e
// consulta medica, e o "Nao entendi" leva a pessoa de volta ao caminho da
// equipe.
await caso('Sintoma no meio da escolha não vira resposta automática', [
  ['Oi', 'Como podemos ajudar'],
  ['2', 'Em qual unidade'],
  ['ele está com febre, quanto custa?', 'Não entendi'],
], { respostasProntas: RESPOSTAS })

// Urgencia nunca entra na conta: ela responde sempre, mesmo depois do limite.
await caso('Urgência responde mesmo com o limite estourado', [
  ['Oi', 'Como podemos ajudar'],
  ['3', 'direcionando você'],
  ['Vocês atendem convênio?', 'continua na fila'],
  ['Qual o valor?', 'continua na fila'],
  ['Aceitam cartão?', 'continua na fila'],
  ['E o reembolso do plano?', null],
  ['é urgente, ele está passando mal', 'urgente'],
], { respostasProntas: RESPOSTAS })

// O assunto marcado para perguntar a unidade nao responde o texto dele: faz a
// mesma pergunta da opcao 1 e entrega o texto do lugar escolhido.
const RESPOSTAS_POR_UNIDADE = [
  { ...RESPOSTAS[0], ask_unit: true },
  RESPOSTAS[1],
]

await caso('"Quanto custa" pergunta onde antes de responder', [
  ['Quanto custa a consulta?', ['Para qual atendimento', 'Liferty · Santos', 'Telemedicina']],
  ['4', 'Retorno presencial em 30 dias'],
], { respostasProntas: RESPOSTAS_POR_UNIDADE, telemedicina: TELE })

await caso('"Quanto custa" com um lugar só responde o texto do assunto', [
  ['Quanto custa a consulta?', 'custa R$ 450,00'],
], { respostasProntas: RESPOSTAS_POR_UNIDADE, unidades: UMA_UNIDADE })

// ---------------------------------------------------------------------------
// Telemedicina
//
// Nao tem agenda propria: usa os horarios das unidades fisicas. A consulta e
// gravada na unidade que cedeu o horario, com modalidade 'telemedicina'. E a
// unica etapa com saida de urgencia.
// ---------------------------------------------------------------------------

const SLOTS_DUAS = {
  'u-santos': [
    { slot_start: '2026-08-31T11:00:00Z', slot_end: '2026-08-31T11:40:00Z' },
    { slot_start: '2026-08-31T11:40:00Z', slot_end: '2026-08-31T12:20:00Z' },
  ],
  'u-andre': [],
  'u-vila': [
    { slot_start: '2026-09-02T13:00:00Z', slot_end: '2026-09-02T13:40:00Z' },
  ],
}

await caso('Telemedicina aparece na lista de unidades quando ligada', [
  ['agendar', ['Em qual unidade', 'Telemedicina (por vídeo)']],
], { telemedicina: TELE })

await caso('Telemedicina desligada não aparece', [
  ['agendar', 'Em qual unidade'],
], {
  verificar: ({ transcricao, titulo }) => {
    if (transcricao.join('').includes('Telemedicina')) falhas.push(`${titulo} | listou telemedicina desligada`)
    else passou++
  },
})

await caso('Telemedicina junta os dias das duas unidades', [
  ['agendar', 'Em qual unidade'],
  ['4', ['Datas disponíveis para telemedicina', '31/08', '02/09', 'urgência']],
], { telemedicina: TELE, slots: SLOTS_DUAS })

await caso('Telemedicina marca na unidade que cedeu o horário, como telemedicina', [
  ['agendar', 'Em qual unidade'],
  ['4', 'Datas disponíveis para telemedicina'],
  ['2', 'Horários de'],
  ['1', ['Consulta marcada', 'por vídeo', 'link da consulta']],
], {
  telemedicina: TELE,
  slots: SLOTS_DUAS,
  pacientes: [ANA],
  verificar: ({ marcadas, titulo }) => {
    const m = marcadas[0]
    if (!m) return falhas.push(`${titulo} | nada foi marcado`)
    if (m.unit_id !== 'u-vila') falhas.push(`${titulo} | unidade errada: ${m.unit_id}`)
    else passou++
    if (m.modality !== 'telemedicina') falhas.push(`${titulo} | modalidade errada: ${m.modality}`)
    else passou++
  },
})

await caso('Urgência na telemedicina transfere para a equipe', [
  ['agendar', 'Em qual unidade'],
  ['4', 'Datas disponíveis para telemedicina'],
  ['é urgente', ['transferindo você para um atendente', 'urgência']],
  ['meu filho não para de vomitar', null],
], {
  telemedicina: TELE,
  slots: SLOTS_DUAS,
  verificar: ({ conversa, titulo }) => {
    if (conversa.booking_state !== 'atendente') falhas.push(`${titulo} | estado ${conversa.booking_state}`)
    else passou++
  },
})

// Nasceu na telemedicina, mas vale em qualquer etapa: quem escreve "urgente"
// escolhendo o dia em Santos tambem e transferido, com a bandeira.
await caso('Urgência vale em qualquer etapa', [
  ['agendar', 'Em qual unidade'],
  ['1', 'Datas disponíveis em Liferty'],
  ['urgente', 'transferindo você para um atendente'],
], { telemedicina: TELE, slots: SLOTS_DUAS })

await caso('Urgência como primeira mensagem também transfere', [
  ['é urgente, meu filho está passando mal', 'transferindo você para um atendente'],
])

await caso('Informações da telemedicina vêm do texto próprio', [
  ['Oi', 'Como podemos ajudar'],
  ['1', ['Para qual atendimento', 'Telemedicina']],
  ['4', ['Retorno presencial em 30 dias', 'urgência']],
  ['urgente', 'transferindo você para um atendente'],
], { telemedicina: TELE })

// ---------------------------------------------------------------

console.log('\n============================================')
console.log(`VERIFICAÇÕES QUE PASSARAM: ${passou}`)
console.log(`FALHAS: ${falhas.length}`)
console.log('============================================')
for (const f of falhas) console.log('\n✗ ' + f)

console.log('\n\n===== PONTOS PARA OLHAR =====')
for (const a of achados) console.log('\n' + a)
