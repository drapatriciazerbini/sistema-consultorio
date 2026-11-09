// Robo no Direct do Instagram (01/10/2026).
// Regra em supabase/functions/_shared/instagram.ts.
import assert from 'node:assert/strict'
import {
  decidirResposta,
  adaptarTexto,
  corpoDoEnvio,
  ecoDoRobo,
  pediuPessoa,
  BOTOES,
  CONVITE_PARA_AGENDAR,
  TETO_SEGUIDAS,
  ESPERANDO_EQUIPE,
  seguidasQueContam,
  hostDoToken,
  deveRetomar,
  RETOMADA,
  primeiroNome,
  comNome,
  respostaRepetida,
  recusaGentil,
  pedeOpiniao,
  textoRecebido,
  chaveRecusada,
  deveAvisarChave,
  ESPERA_DO_AVISO_DA_CHAVE_MS,
  anexosDoDirect,
  urlDaMeta,
  caminhoDoAnexo,
  tipoParaOAcervo,
  TIPOS_DO_ACERVO,
  TETO_DO_ANEXO,
  guardarAnexosDoDirect,
} from './instagram.build.mjs'
import { readFileSync } from 'node:fs'

let ok = 0
function caso(nome, fn) {
  try {
    fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

// As respostas prontas da Dra. Patricia, como estao no banco (24/09/2026).
const respostas = [
  {
    id: 'v', assunto: 'Valor e pagamento', perguntarUnidade: true,
    palavras: ['valor', 'valores', 'preco', 'preço', 'custa', 'quanto', 'pagamento', 'pix', 'reembolso', 'particular'],
    resposta: '💚 *Valores da consulta*, com retorno incluso:\n\n• Consultório (Gonzaga): R$ 600,00\n• Em casa, em Santos e São Vicente: R$ 800,00\n\n💳 Atendimento particular.',
  },
  {
    id: 'c', assunto: 'Convênios', perguntarUnidade: false,
    palavras: ['convenio', 'convênio', 'plano', 'unimed', 'amil'],
    resposta: '💳 *Convênios*\n\nO atendimento é particular, sem convênio credenciado.\n\nEmitimos recibo com CRM e CNPJ para você pedir reembolso ao seu plano.',
  },
  {
    id: 'r', assunto: 'Região da visita domiciliar', perguntarUnidade: false,
    palavras: ['domicilio', 'domiciliar', 'casa', 'visita', 'vicente'],
    resposta: '🏠 *Consulta em casa*\n\nA Dra. Patrícia atende em casa em *Santos e São Vicente*.\n\nPara pedir a visita, digite *2* e escolha *Visita domiciliar*.',
  },
  {
    id: 'e', assunto: 'Endereço do consultório', perguntarUnidade: false,
    palavras: ['endereco', 'endereço', 'onde', 'consultorio', 'gonzaga'],
    resposta: '📍 *Consultório*\n\nRua Dr. Tolentino Filgueiras, 119, Gonzaga, Santos - SP.\n\nDigite *2* para agendar.',
  },
  {
    id: 'i', assunto: 'Idade atendida', perguntarUnidade: false,
    palavras: ['idade', 'idoso', 'idosa', 'adulto', 'crianca', 'pediatra', 'anos'],
    resposta: '👵 *Quem a Dra. Patrícia atende*\n\nAdultos, com atenção especial à pessoa idosa.',
  },
  {
    id: 'esp', assunto: 'Especialidade da Dra. Patrícia', perguntarUnidade: false,
    palavras: ['especialidade', 'especialid', 'especialista', 'geriatra', 'geriatr', 'geriatria', 'clinico', 'formacao', 'rqe'],
    resposta: '🩺 *Especialidade da Dra. Patrícia*\n\nA Dra. Patrícia Zerbini é Geriatra: médica de Clínica Médica (RQE 20357).',
  },
  {
    id: 'psi', assunto: 'Psicoterapia e psicólogo', perguntarUnidade: false,
    palavras: ['psicoterapia', 'psicoter', 'psicoterapeuta', 'psicoterapeutico', 'psicologo', 'psicolog', 'terapia', 'terapeuta'],
    resposta: '🧠 *Psicoterapia*\n\nA Dra. Patrícia é médica geriatra e não faz psicoterapia.',
  },
]

const agora = new Date('2026-10-01T15:00:00Z')
const novo = { menuEnviadoEm: null, humanoRespondeuEm: null, respostasSeguidas: 0 }
const jaApresentado = { ...novo, menuEnviadoEm: '2026-10-01T14:50:00Z', respostasSeguidas: 1 }

caso('pergunta de valor responde o texto da clinica, sem asterisco, convidando a agendar por aqui', () => {
  const d = decidirResposta({ texto: 'Qual é o valor da consulta?', respostas, estado: novo, agora })
  assert.ok(d)
  assert.match(d.texto, /R\$ 600,00/)
  assert.match(d.texto, /R\$ 800,00/)
  assert.ok(!d.texto.includes('*'))
  assert.ok(d.texto.endsWith(CONVITE_PARA_AGENDAR))
  assert.ok(!/wa\.me|whatsapp/i.test(d.texto))
  assert.ok(d.botoes.some((b) => b.payload === 'AGENDAR'))
})

caso('"Atende convênio?" cai em Convenios', () => {
  const d = decidirResposta({ texto: 'Atende convênio?', respostas, estado: novo, agora })
  assert.match(d.texto, /sem convênio credenciado/)
})

caso('botao tocado responde o assunto e some da lista seguinte', () => {
  const d = decidirResposta({ texto: 'Convênio', payload: 'CONVENIO', respostas, estado: jaApresentado, agora })
  assert.match(d.texto, /sem convênio credenciado/)
  assert.ok(!d.botoes.some((b) => b.payload === 'CONVENIO'))
})

caso('instrucao de menu do WhatsApp ("digite 2") nao vai para o Direct', () => {
  const d = decidirResposta({ texto: '', payload: 'CASA', respostas, estado: jaApresentado, agora })
  assert.ok(!/digite/i.test(d.texto))
  assert.match(d.texto, /Santos e São Vicente/)
})

caso('primeira mensagem sem assunto conhecido recebe a apresentacao com os botoes', () => {
  const d = decidirResposta({ texto: 'Oi, boa tarde', respostas, estado: novo, agora })
  assert.equal(d.menu, true)
  assert.equal(d.botoes.length, BOTOES.length)
})

caso('depois da apresentacao, o que nao entende vai para a equipe e o robo cala', () => {
  const d = decidirResposta({ texto: 'minha mae mora sozinha no litoral', respostas, estado: jaApresentado, agora })
  assert.equal(d.avisar, true)
  assert.equal(d.calarDepois, true)
})

caso('quer marcar: fica no Direct, pede consultorio ou casa, avisa a equipe e cala', () => {
  const d = decidirResposta({ texto: 'quero agendar para minha mãe', respostas, estado: novo, agora })
  assert.match(d.texto, /aqui mesmo, pelo Direct/)
  assert.match(d.texto, /consulta em casa/)
  assert.ok(!/wa\.me|whatsapp/i.test(d.texto))
  assert.equal(d.avisar, true)
  assert.equal(d.calarDepois, true)
  assert.equal(d.motivo, 'agendar')
})

caso('botao Agendar faz o mesmo que escrever que quer marcar', () => {
  const d = decidirResposta({ texto: 'Agendar', payload: 'AGENDAR', respostas, estado: jaApresentado, agora })
  assert.equal(d.motivo, 'agendar')
  assert.equal(d.avisar, true)
  assert.equal(d.calarDepois, true)
})

caso('nenhuma mensagem do robo manda para o WhatsApp', () => {
  for (const texto of ['quero falar com uma pessoa', 'minha mãe está com febre', 'xyz']) {
    const d = decidirResposta({ texto, respostas, estado: jaApresentado, agora })
    assert.ok(!/wa\.me|whatsapp/i.test(d.texto), texto)
  }
})

caso('assunto clinico nunca e respondido, mesmo com palavra de resposta pronta', () => {
  const d = decidirResposta({ texto: 'qual o valor? minha mãe está com febre', respostas, estado: novo, agora })
  assert.match(d.texto, /não respondemos por mensagem automática/)
  assert.match(d.texto, /192/)
  assert.equal(d.avisar, true)
})

caso('pedir uma pessoa avisa a equipe', () => {
  assert.equal(pediuPessoa('quero falar com uma pessoa'), true)
  assert.equal(pediuPessoa('falar com a doutora'), true)
  assert.equal(pediuPessoa('qual o valor'), false)
  const d = decidirResposta({ texto: 'Quero falar com a equipe', respostas, estado: novo, agora })
  assert.equal(d.avisar, true)
})

caso('alguem da equipe respondeu ha pouco: o robo fica calado', () => {
  const estado = { ...novo, humanoRespondeuEm: '2026-10-01T10:00:00Z' }
  assert.equal(decidirResposta({ texto: 'Qual o valor?', respostas, estado, agora }), null)
})

caso('equipe respondeu ha mais de 12 horas: o robo volta', () => {
  const estado = { ...novo, humanoRespondeuEm: '2026-09-30T20:00:00Z' }
  assert.ok(decidirResposta({ texto: 'Qual o valor?', respostas, estado, agora }))
})

caso('passou do teto de respostas seguidas: calado', () => {
  const estado = { ...jaApresentado, respostasSeguidas: TETO_SEGUIDAS }
  assert.equal(decidirResposta({ texto: 'Qual o valor?', respostas, estado, agora }), null)
})

caso('"obrigada" depois da resposta fecha sem menu; sem conversa antes, calado', () => {
  const d = decidirResposta({ texto: 'Obrigada', respostas, estado: jaApresentado, agora })
  assert.match(d.texto, /Por nada/)
  assert.equal(d.botoes, undefined)
  assert.equal(decidirResposta({ texto: 'Obrigada', respostas, estado: novo, agora }), null)
})

caso('foto ou audio: apresenta na primeira vez, depois espera a equipe', () => {
  assert.equal(decidirResposta({ texto: '', respostas, estado: novo, agora }).menu, true)
  assert.equal(decidirResposta({ texto: '', respostas, estado: jaApresentado, agora }), null)
})

caso('adaptarTexto tira negrito do WhatsApp e o paragrafo do menu', () => {
  assert.equal(adaptarTexto('📍 *Consultório*\n\nRua X.\n\nDigite *2* para agendar.'), '📍 Consultório\n\nRua X.')
})

caso('envio: quick replies com titulo de ate 20 letras e no maximo 13', () => {
  const corpo = corpoDoEnvio('123', { texto: 'oi', botoes: BOTOES })
  assert.equal(corpo.recipient.id, '123')
  assert.equal(corpo.messaging_type, 'RESPONSE')
  assert.ok(corpo.message.quick_replies.every((q) => q.title.length <= 20 && q.content_type === 'text'))
  assert.equal(corpoDoEnvio('1', { texto: 'x'.repeat(1500) }).message.text.length, 1000)
  assert.equal(corpoDoEnvio('1', { texto: 'x' }).message.quick_replies, undefined)
})

caso('eco: o do robo nao conta como resposta da equipe', () => {
  assert.equal(ecoDoRobo('m1', 'm1', null, agora), true)
  assert.equal(ecoDoRobo('m2', 'm1', '2026-10-01T14:59:30Z', agora), true)
  assert.equal(ecoDoRobo('m2', 'm1', '2026-10-01T14:00:00Z', agora), false)
  assert.equal(ecoDoRobo('m2', null, null, agora), false)
})

caso('chave do login do Instagram vai para graph.instagram.com; de Pagina, graph.facebook.com', () => {
  assert.equal(hostDoToken('IGAAx123'), 'graph.instagram.com')
  assert.equal(hostDoToken('EAAB123'), 'graph.facebook.com')
})

caso('no teto, botao tocado e "quero agendar" ainda passam; texto solto nao', () => {
  const estado = { ...jaApresentado, respostasSeguidas: TETO_SEGUIDAS }
  assert.match(decidirResposta({ texto: 'Endereço', payload: 'ENDERECO', respostas, estado, agora }).texto, /Tolentino/)
  assert.equal(decidirResposta({ texto: 'quero agendar', respostas, estado, agora }).motivo, 'agendar')
  assert.equal(decidirResposta({ texto: 'Qual o valor?', respostas, estado, agora }), null)
})

caso('a conta de respostas seguidas zera um dia depois da ultima resposta', () => {
  assert.equal(seguidasQueContam(TETO_SEGUIDAS, '2026-10-01T14:00:00Z', new Date('2026-10-01T20:00:00Z')), TETO_SEGUIDAS)
  assert.equal(seguidasQueContam(TETO_SEGUIDAS, '2026-10-01T14:00:00Z', new Date('2026-10-02T15:00:00Z')), 0)
  assert.equal(seguidasQueContam(ESPERANDO_EQUIPE, '2026-10-01T14:00:00Z', new Date('2026-10-02T15:00:00Z')), 0)
})

caso('esperando a equipe: o que a pessoa escreve e para a equipe; so botao de informacao responde', () => {
  const estado = { ...jaApresentado, respostasSeguidas: ESPERANDO_EQUIPE }
  assert.equal(decidirResposta({ texto: 'quero marcar em casa, terça de manhã', respostas, estado, agora }), null)
  assert.equal(decidirResposta({ texto: 'Agendar', payload: 'AGENDAR', respostas, estado, agora }), null)
  const d = decidirResposta({ texto: 'Valores', payload: 'VALOR', respostas, estado, agora })
  assert.match(d.texto, /R\$ 600,00/)
  assert.ok(!d.texto.includes(CONVITE_PARA_AGENDAR))
  assert.ok(!d.botoes.some((b) => b.payload === 'AGENDAR' || b.payload === 'EQUIPE'))
})

caso('esperando a equipe: duvida curta escrita tambem responde; resposta do agendamento nao', () => {
  const estado = { ...jaApresentado, respostasSeguidas: ESPERANDO_EQUIPE }
  assert.match(decidirResposta({ texto: 'valor', respostas, estado, agora }).texto, /R\$ 600,00/)
  assert.match(decidirResposta({ texto: 'Endereço', respostas, estado, agora }).texto, /Tolentino/)
  assert.match(decidirResposta({ texto: 'qual o endereço?', respostas, estado, agora }).texto, /Tolentino/)
  assert.equal(decidirResposta({ texto: 'em casa', respostas, estado, agora }), null)
  assert.equal(decidirResposta({ texto: 'consultório, quinta à tarde', respostas, estado, agora }), null)
  assert.equal(decidirResposta({ texto: 'ela tem 85 anos', respostas, estado, agora }), null)
})

caso('pedido de agendamento traz os botoes de informacao, sem Agendar', () => {
  const d = decidirResposta({ texto: 'quero agendar', respostas, estado: novo, agora })
  assert.ok(d.botoes.some((b) => b.payload === 'VALOR'))
  assert.ok(!d.botoes.some((b) => b.payload === 'AGENDAR' || b.payload === 'EQUIPE'))
})

caso('post do anuncio compartilhado sem texto: calado, a pergunta vem logo depois', () => {
  assert.equal(decidirResposta({ texto: '', respostas, estado: novo, soCompartilhamento: true, agora }), null)
  assert.equal(decidirResposta({ texto: '', respostas, estado: novo, agora }).menu, true)
})

caso('ja conversando: "preciso de mais informacoes" ganha os botoes sem novo Ola', () => {
  const estado = { ...novo, respostasSeguidas: 2 }
  const d = decidirResposta({ texto: 'Não, preciso de mais informações.', respostas, estado, agora })
  assert.match(d.texto, /^Claro!/)
  assert.equal(d.botoes.length, BOTOES.length)
})

caso('ja conversando: pergunta que o robo nao sabe vai para a equipe, sem novo Ola', () => {
  const estado = { ...novo, respostasSeguidas: 3 }
  const d = decidirResposta({ texto: 'Tem desconto pra 2 pessoas?', respostas, estado, agora })
  assert.equal(d.avisar, true)
  assert.ok(!/^Olá/.test(d.texto))
})

caso('cada resposta diz o que contar na aba Instagram', () => {
  assert.deepEqual(decidirResposta({ texto: 'Oi', respostas, estado: novo, agora }).evento, { tipo: 'menu' })
  assert.equal(decidirResposta({ texto: 'Qual o valor?', respostas, estado: novo, agora }).evento.tipo, 'resposta')
  assert.ok(decidirResposta({ texto: 'Qual o valor?', respostas, estado: novo, agora }).evento.detalhe)
  assert.deepEqual(decidirResposta({ texto: 'quero agendar', respostas, estado: novo, agora }).evento, { tipo: 'agendar' })
  assert.deepEqual(decidirResposta({ texto: 'minha mãe está com febre', respostas, estado: novo, agora }).evento, { tipo: 'equipe', detalhe: 'saude' })
  assert.deepEqual(decidirResposta({ texto: 'quero falar com uma pessoa', respostas, estado: novo, agora }).evento, { tipo: 'equipe', detalhe: 'pediu' })
})

// 06/10/2026, conversas reais do Direct.
caso('"Qual a especialidade?" depois do valor responde a especialidade, nao "nao entendi"', () => {
  const d = decidirResposta({ texto: 'Qual a especialidade?', respostas, estado: jaApresentado, agora })
  assert.match(d.texto, /Geriatra/)
  assert.equal(d.evento.detalhe, 'Especialidade da Dra. Patrícia')
})

caso('idoso procurando psicoterapia recebe a resposta de psicoterapia, nao a de idade', () => {
  const d = decidirResposta({ texto: 'Moro em Santos sou idoso tenho algumas comorbidades porém no momento estou na busca de um atendimento psicoterapeutico', respostas, estado: jaApresentado, agora })
  assert.match(d.texto, /não faz psicoterapia/)
})

caso('"melhor aguardar para conversar em horário comercial" chama a equipe, nao vira agendamento', () => {
  const d = decidirResposta({ texto: 'Bem acho melhor aguardar para conversar em horário comercial', respostas, estado: jaApresentado, agora })
  assert.match(d.texto, /horário comercial/)
  assert.ok(!/Que bom/.test(d.texto))
  assert.equal(d.avisar, true)
  assert.equal(d.calarDepois, true)
  assert.deepEqual(d.evento, { tipo: 'equipe', detalhe: 'vai_esperar' })
})

caso('"quais os horarios disponiveis?" continua sendo agendamento', () => {
  assert.deepEqual(decidirResposta({ texto: 'Quais são os horários disponíveis para consulta?', respostas, estado: novo, agora }).evento, { tipo: 'agendar' })
})

// Retomada (07/10/2026): quem perguntou o valor e sumiu.
const agoraR = new Date('2026-10-07T18:00:00Z')
const h = (horas) => new Date(agoraR.getTime() - horas * 3_600_000).toISOString()
const sumiu = { ultimoTipo: 'resposta', roboEm: h(4), entradaEm: h(4.01), humanoEm: null, retomadaEm: null, seguidas: 1 }

caso('retomada: respondeu o valor ha 4 horas e a pessoa sumiu', () => {
  assert.equal(deveRetomar(sumiu, agoraR, 15), true)
  assert.match(RETOMADA.texto, /Ficou alguma dúvida/)
  assert.deepEqual(RETOMADA.botoes.map((b) => b.payload), ['COMO', 'AGENDAR', 'EQUIPE'])
  assert.deepEqual(RETOMADA.evento, { tipo: 'retomada' })
})

caso('retomada: nao sai cedo, fora do horario, nem fora da janela da Meta', () => {
  assert.equal(deveRetomar({ ...sumiu, roboEm: h(1), entradaEm: h(1.01) }, agoraR, 15), false)
  assert.equal(deveRetomar(sumiu, agoraR, 8), false)
  assert.equal(deveRetomar(sumiu, agoraR, 20), false)
  assert.equal(deveRetomar({ ...sumiu, roboEm: h(23.5), entradaEm: h(23.6) }, agoraR, 15), false)
})

caso('retomada: nao sai se a pessoa escreveu de novo, se a equipe falou, ou se ja foi', () => {
  assert.equal(deveRetomar({ ...sumiu, entradaEm: h(3.5) }, agoraR, 15), false)
  assert.equal(deveRetomar({ ...sumiu, humanoEm: h(3.9) }, agoraR, 15), false)
  assert.equal(deveRetomar({ ...sumiu, retomadaEm: h(1) }, agoraR, 15), false)
  assert.equal(deveRetomar({ ...sumiu, ultimoTipo: 'retomada' }, agoraR, 15), false)
})

caso('retomada: so depois de resposta ou apresentacao, nunca de agendar, equipe ou agradecimento', () => {
  assert.equal(deveRetomar({ ...sumiu, ultimoTipo: 'menu' }, agoraR, 15), true)
  for (const tipo of ['agendar', 'equipe', 'agradecimento', null]) assert.equal(deveRetomar({ ...sumiu, ultimoTipo: tipo }, agoraR, 15), false)
  assert.equal(deveRetomar({ ...sumiu, seguidas: ESPERANDO_EQUIPE }, agoraR, 15), false)
})

caso('retomada de dias atras: vale de novo depois de uma mensagem nova da pessoa', () => {
  assert.equal(deveRetomar({ ...sumiu, retomadaEm: h(48) }, agoraR, 15), true)
})

// Primeiro nome (08/10/2026).
caso('primeiro nome: so o primeiro, com maiuscula certa; marca, emoji e numero ficam sem nome', () => {
  assert.equal(primeiroNome('MARIA DA SILVA'), 'Maria')
  assert.equal(primeiroNome('hermínia Cristina Ladaga'), 'Hermínia')
  assert.equal(primeiroNome('Lojinha123'), '')
  assert.equal(primeiroNome('🌸 Bete'), '')
  assert.equal(primeiroNome('J'), '')
  assert.equal(primeiroNome('Dra. Ana'), '')
  assert.equal(primeiroNome(null), '')
})

caso('com nome: exclamacao de abertura, emoji no inicio e frase comum', () => {
  assert.equal(comNome('Que bom! A equipe vai combinar.', 'Maria'), 'Que bom, Maria! A equipe vai combinar.')
  assert.equal(comNome('Olá! Aqui é o consultório da Dra. Patrícia Zerbini.', 'Bete'), 'Olá, Bete! Aqui é o consultório da Dra. Patrícia Zerbini.')
  assert.equal(comNome('Oi! Ficou alguma dúvida?', 'Sueli'), 'Oi, Sueli! Ficou alguma dúvida?')
  assert.equal(comNome('💚 Valores da consulta, com retorno incluso:', 'Clarice'), '💚 Clarice, valores da consulta, com retorno incluso:')
  assert.equal(comNome('Não consegui entender por aqui.', 'Julia'), 'Julia, não consegui entender por aqui.')
  assert.equal(comNome('Dra. Patrícia atende em casa.', 'Ana'), 'Ana, Dra. Patrícia atende em casa.')
  assert.equal(comNome('Qualquer coisa', ''), 'Qualquer coisa')
})

// 11/10/2026, conversas reais.
caso('com nome: resposta com titulo leva o nome no texto, nao no titulo', () => {
  assert.equal(comNome('💳 Convênios\n\nO atendimento é particular.', 'Filomena'), '💳 Convênios\n\nFilomena, o atendimento é particular.')
  assert.equal(comNome('🏠 Consulta em casa\n\nA Dra. Patrícia atende em casa.', 'Olive'), '🏠 Consulta em casa\n\nOlive, a Dra. Patrícia atende em casa.')
  assert.equal(comNome('💚 Valores da consulta, com retorno incluso:\n\n• Consultório', 'Rita'), '💚 Rita, valores da consulta, com retorno incluso:\n\n• Consultório')
})

caso('mesma resposta pronta em menos de 15 minutos nao sai de novo', () => {
  const d = { texto: 'x', evento: { tipo: 'resposta', detalhe: 'Valor e pagamento' } }
  const agoraX = new Date('2026-10-11T14:10:00Z')
  assert.equal(respostaRepetida({ detalhe: 'Valor e pagamento', em: '2026-10-11T14:08:00Z' }, d, agoraX), true)
  assert.equal(respostaRepetida({ detalhe: 'Valor e pagamento', em: '2026-10-11T13:40:00Z' }, d, agoraX), false)
  assert.equal(respostaRepetida({ detalhe: 'Convênios', em: '2026-10-11T14:08:00Z' }, d, agoraX), false)
  assert.equal(respostaRepetida(null, d, agoraX), false)
  assert.equal(respostaRepetida({ detalhe: 'Valor e pagamento', em: '2026-10-11T14:08:00Z' }, { texto: 'y', evento: { tipo: 'agendar' } }, agoraX), false)
})

caso('"Nao, obrigada" depois da retomada fecha com gentileza, sem chamar a equipe (Sonia, 12/10)', () => {
  const d = decidirResposta({ texto: 'Não, obrigada 🙏', respostas, estado: jaApresentado, agora })
  assert.match(d.texto, /Tudo bem/)
  assert.equal(d.avisar, undefined)
  assert.equal(d.calarDepois, undefined)
  assert.equal(d.botoes, undefined)
  assert.equal(d.evento.tipo, 'agradecimento')
  for (const t of ['Não', 'nao obrigado', 'Por enquanto não, obrigada', 'Não, tudo certo', 'Nenhuma dúvida, obrigada', 'agora não']) {
    assert.equal(recusaGentil(t), true, t)
  }
  for (const t of ['Não sei onde fica', 'Não atende convênio?', 'Sem dúvida!', 'Obrigada', 'Não tenho carro, ela vem em casa?']) {
    assert.equal(recusaGentil(t), false, t)
  }
  assert.equal(decidirResposta({ texto: 'Não, obrigada', respostas, estado: novo, agora }), null)
})

caso('"Ja ouviu falar??" sobre video compartilhado vai para a equipe, sem menu (Sonia, 12/10)', () => {
  const d = decidirResposta({ texto: 'Já ouviu falar?? ', respostas, estado: novo, agora })
  assert.equal(d.menu, undefined)
  assert.equal(d.avisar, true)
  assert.equal(d.evento.detalhe, 'opiniao')
  for (const t of ['O que a Dra acha disso?', 'o que vc acha?', 'Isso é verdade?', 'Vale a pena tomar essa vacina?']) assert.equal(pedeOpiniao(t), true, t)
  assert.equal(pedeOpiniao('Qual o valor da consulta?'), false)
})

// Chat do Direct na Central (19/10/2026): o que vai para o historico.
caso('texto da mensagem vai como veio; anexo sem texto vira rótulo', () => {
  assert.equal(textoRecebido({ text: '  Qual o valor?  ' }), 'Qual o valor?')
  assert.equal(textoRecebido({ attachments: [{ type: 'image' }] }), '[foto]')
  assert.equal(textoRecebido({ attachments: [{ type: 'audio' }, { type: 'image' }] }), '[áudio] [foto]')
  assert.equal(textoRecebido({ attachments: [{ type: 'ig_reel' }] }), '[reel compartilhado]')
  assert.equal(textoRecebido({ attachments: [{ type: 'algo_novo' }] }), '[anexo]')
  assert.equal(textoRecebido({}), '[mensagem sem texto]')
  assert.equal(textoRecebido(undefined), '[mensagem sem texto]')
  // Texto junto com anexo: vale o texto.
  assert.equal(textoRecebido({ text: 'olha isso', attachments: [{ type: 'share' }] }), 'olha isso')
})

// Chave recusada (03/11/2026): de 31/10 a 03/11 o robo nao respondeu ninguem
// no Direct, e so a conversa aberta na Central mostrava "nao enviada".
caso('chave recusada pela Meta e reconhecida; recusa so da mensagem nao', () => {
  const de0311 = {
    error: {
      message:
        'Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.',
      type: 'OAuthException',
      code: 190,
    },
  }
  assert.equal(chaveRecusada(401, de0311), true)
  assert.equal(chaveRecusada(400, { error: { code: 190, message: 'Invalid OAuth access token.' } }), true)
  assert.equal(chaveRecusada(400, { error: { message: 'Error validating access token: Session has expired.' } }), true)
  // Fora da janela de 24 horas, pessoa indisponivel, Meta fora do ar: o robo
  // segue vivo para os outros, e avisar a equipe so assustaria.
  assert.equal(chaveRecusada(400, { error: { code: 10, message: 'This message is sent outside of allowed window.' } }), false)
  assert.equal(chaveRecusada(400, { error: { code: 551, message: "This person isn't available right now." } }), false)
  assert.equal(chaveRecusada(500, { error: { code: 2, message: 'Service temporarily unavailable' } }), false)
  assert.equal(chaveRecusada(502, null), false)
})

caso('aviso da chave recusada: na primeira recusa e depois de 12 em 12 horas', () => {
  const agora = new Date('2026-11-03T14:46:00Z')
  const horasAtras = (h) => new Date(agora.getTime() - h * 3_600_000).toISOString()
  assert.equal(ESPERA_DO_AVISO_DA_CHAVE_MS, 12 * 3_600_000)
  assert.equal(deveAvisarChave(null, agora), true)
  assert.equal(deveAvisarChave(horasAtras(1), agora), false)
  assert.equal(deveAvisarChave(horasAtras(11.9), agora), false)
  assert.equal(deveAvisarChave(horasAtras(12), agora), true)
  assert.equal(deveAvisarChave('data estragada', agora), true)
})

// Anexos do Direct na Central (08/11/2026): a Rita mandou tres "[anexo]" junto
// com a pergunta do anuncio e ninguem soube o que eram.
caso('tipos da documentação do Direct ganham rótulo; desconhecido segue "[anexo]"', () => {
  assert.equal(textoRecebido({ attachments: [{ type: 'ig_post' }] }), '[post compartilhado]')
  assert.equal(textoRecebido({ attachments: [{ type: 'story' }] }), '[story compartilhado]')
  assert.equal(textoRecebido({ attachments: [{ type: 'media' }] }), '[mídia]')
  assert.equal(textoRecebido({ attachments: [{ type: 'coisa_da_meta_de_2027' }] }), '[anexo]')
})

caso('anexo guarda o tipo cru e o link que a Meta mandou', () => {
  const url = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123&signature=abc'
  assert.deepEqual(anexosDoDirect({ attachments: [{ type: 'image', payload: { url } }] }), [{ tipo: 'image', url }])
  // Sem payload (ou com lixo no lugar da URL): o tipo fica, o link nao.
  assert.deepEqual(anexosDoDirect({ attachments: [{ type: 'ig_post' }, { type: 'audio', payload: { url: 42 } }] }), [
    { tipo: 'ig_post', url: null },
    { tipo: 'audio', url: null },
  ])
  assert.deepEqual(anexosDoDirect({ attachments: [{}] }), [{ tipo: 'desconhecido', url: null }])
  assert.deepEqual(anexosDoDirect({ text: 'oi' }), [])
  assert.deepEqual(anexosDoDirect(undefined), [])
  assert.deepEqual(anexosDoDirect({ attachments: 'nao e lista' }), [])
  // O Direct manda no maximo dez fotos; mais que isso e lixo.
  assert.equal(anexosDoDirect({ attachments: Array.from({ length: 14 }, () => ({ type: 'image', payload: { url } })) }).length, 10)
})

caso('só baixa de servidor da Meta, por https', () => {
  assert.equal(urlDaMeta('https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1'), true)
  assert.equal(urlDaMeta('https://scontent-gru2-1.cdninstagram.com/v/t51/abc.mp4?oh=1'), true)
  assert.equal(urlDaMeta('https://video.xx.fbcdn.net/v/abc.mp4'), true)
  assert.equal(urlDaMeta('http://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1'), false)
  assert.equal(urlDaMeta('https://fbsbx.com.golpe.net/foto.jpg'), false)
  assert.equal(urlDaMeta('https://naofbsbx.com/foto.jpg'), false)
  assert.equal(urlDaMeta('https://169.254.169.254/latest/meta-data'), false)
  assert.equal(urlDaMeta('nao e url'), false)
  assert.equal(urlDaMeta(null), false)
})

caso('caminho no acervo: pasta da clínica e mid sem caractere que vire pasta', () => {
  const clinica = '11111111-2222-3333-4444-555555555555'
  const caminho = caminhoDoAnexo(clinica, 'aWdf/ZAG1+faXRlb=Tox', 2)
  assert.equal(caminho, `${clinica}/aWdf_ZAG1_faXRlb_Tox-2`)
  // Uma barra a mais e o arquivo cairia fora da pasta da clinica, e a
  // permissao de leitura (pasta = clinica) deixaria de valer.
  assert.equal(caminho.split('/').length, 2)
})

caso('tipo do arquivo: vale o que o acervo aceita; octet-stream usa o tipo do anexo', () => {
  assert.equal(tipoParaOAcervo('image/jpeg; charset=binary', 'image'), 'image/jpeg')
  assert.equal(tipoParaOAcervo('audio/mp4', 'audio'), 'audio/mp4')
  assert.equal(tipoParaOAcervo('video/quicktime', 'video'), 'video/quicktime')
  assert.equal(tipoParaOAcervo('application/octet-stream', 'audio'), 'audio/mp4')
  assert.equal(tipoParaOAcervo('', 'ig_reel'), 'video/mp4')
  assert.equal(tipoParaOAcervo(null, 'image'), 'image/jpeg')
  // Pagina de erro da CDN com status 200 nao entra no acervo como se fosse foto.
  assert.equal(tipoParaOAcervo('text/html', 'image'), null)
  assert.equal(tipoParaOAcervo('application/octet-stream', 'share'), null)
  assert.equal(TETO_DO_ANEXO, 25 * 1024 * 1024)
})

caso('lista de tipos do código é a mesma do bucket na migration', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261108120000_anexos_do_instagram.sql', import.meta.url), 'utf8')
  const lista = sql.match(/'instagram-anexos',\s*false,\s*\d+,\s*array\[([^\]]+)\]/)?.[1] ?? ''
  const doBucket = new Set([...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]))
  assert.ok(doBucket.size > 10, 'nao achei a lista do bucket na migration')
  assert.deepEqual([...TIPOS_DO_ACERVO].sort(), [...doBucket].sort())
  // E todo tipo que o codigo deduz cabe no bucket.
  for (const tipo of ['image', 'audio', 'video', 'ig_reel']) assert.ok(doBucket.has(tipoParaOAcervo('', tipo)), tipo)
})

// A copia para o acervo, contra um banco, um acervo e uma Meta falsos.
function bancoFalso({ semColuna = false, acervoRecusa = false } = {}) {
  const gravacoes = []
  const uploads = []
  return {
    gravacoes,
    uploads,
    from(tabela) {
      return {
        update(valores) {
          return {
            eq: async (coluna, valor) => {
              if (semColuna) return { error: { message: 'column "anexos" of relation "instagram_messages" does not exist' } }
              gravacoes.push({ tabela, valores: structuredClone(valores), coluna, valor })
              return { error: null }
            },
          }
        },
      }
    },
    storage: {
      from(bucket) {
        return {
          upload: async (caminho, corpo, opcoes) => {
            uploads.push({ bucket, caminho, tamanho: corpo.byteLength, ...opcoes })
            return { error: acervoRecusa ? { message: 'mime type not supported' } : null }
          },
        }
      },
    },
  }
}

async function comMetaFalsa(respostas, fn) {
  const fetchOriginal = globalThis.fetch
  const errorOriginal = console.error
  const pedidos = []
  const gritos = []
  globalThis.fetch = async (url) => {
    pedidos.push(String(url))
    const r = respostas[String(url)]
    return r ? r() : new Response('nao achei', { status: 404 })
  }
  console.error = (...partes) => gritos.push(partes.join(' '))
  try {
    await fn({ pedidos, gritos })
  } finally {
    globalThis.fetch = fetchOriginal
    console.error = errorOriginal
  }
}

const casosAssincronos = []
function casoAssincrono(nome, fn) {
  casosAssincronos.push(async () => {
    try {
      await fn()
      ok++
    } catch (erro) {
      console.error('FALHOU:', nome)
      throw erro
    }
  })
}

const CLINICA = '11111111-2222-3333-4444-555555555555'
const FOTO = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1&signature=x'
const AUDIO = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=2&signature=y'

casoAssincrono('foto e áudio vão para o acervo e a mensagem ganha o caminho', async () => {
  const banco = bancoFalso()
  await comMetaFalsa(
    {
      [FOTO]: () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
      [AUDIO]: () => new Response(new Uint8Array([4, 5]), { headers: { 'content-type': 'application/octet-stream' } }),
    },
    async ({ gritos }) => {
      await guardarAnexosDoDirect(banco, CLINICA, 'mid/1', [
        { tipo: 'image', url: FOTO },
        { tipo: 'audio', url: AUDIO },
      ])
      assert.deepEqual(gritos, [])
    },
  )
  // Primeiro o tipo e o link (a tela sabe o que chegou mesmo se o download cair)...
  assert.equal(banco.gravacoes.length, 2)
  assert.deepEqual(banco.gravacoes[0].valores.anexos.map((a) => a.tipo), ['image', 'audio'])
  assert.equal(banco.gravacoes[0].valores.anexos[0].path, undefined)
  assert.equal(banco.gravacoes[0].valor, 'mid/1')
  // ...depois o caminho no acervo privado.
  assert.deepEqual(banco.uploads.map((u) => [u.bucket, u.caminho, u.contentType]), [
    ['instagram-anexos', `${CLINICA}/mid_1-0`, 'image/jpeg'],
    ['instagram-anexos', `${CLINICA}/mid_1-1`, 'audio/mp4'],
  ])
  assert.deepEqual(banco.gravacoes[1].valores.anexos, [
    { tipo: 'image', url: FOTO, path: `${CLINICA}/mid_1-0`, mime: 'image/jpeg' },
    { tipo: 'audio', url: AUDIO, path: `${CLINICA}/mid_1-1`, mime: 'audio/mp4' },
  ])
})

casoAssincrono('Meta não entrega o arquivo: fica o tipo e o link, e o log grita', async () => {
  const banco = bancoFalso()
  await comMetaFalsa({}, async ({ gritos }) => {
    await guardarAnexosDoDirect(banco, CLINICA, 'mid2', [{ tipo: 'video', url: FOTO }])
    assert.equal(gritos.length, 1)
    assert.match(gritos[0], /nao entregou o anexo/)
  })
  assert.equal(banco.gravacoes.length, 1)
  assert.deepEqual(banco.gravacoes[0].valores.anexos, [{ tipo: 'video', url: FOTO }])
  assert.equal(banco.uploads.length, 0)
})

casoAssincrono('endereço fora da Meta nem é pedido', async () => {
  const banco = bancoFalso()
  await comMetaFalsa({}, async ({ pedidos, gritos }) => {
    await guardarAnexosDoDirect(banco, CLINICA, 'mid3', [{ tipo: 'image', url: 'https://169.254.169.254/latest/meta-data' }])
    assert.deepEqual(pedidos, [])
    assert.match(gritos[0], /fora da Meta/)
  })
  assert.equal(banco.uploads.length, 0)
})

casoAssincrono('acervo recusa: não grava caminho falso e grita', async () => {
  const banco = bancoFalso({ acervoRecusa: true })
  await comMetaFalsa(
    { [FOTO]: () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }) },
    async ({ gritos }) => {
      await guardarAnexosDoDirect(banco, CLINICA, 'mid4', [{ tipo: 'image', url: FOTO }])
      assert.match(gritos.join('\n'), /acervo recusou/)
    },
  )
  assert.equal(banco.gravacoes.length, 1)
  assert.equal(banco.gravacoes[0].valores.anexos[0].path, undefined)
})

casoAssincrono('sem a coluna nova (migration atrasada): nem baixa, avisa e não lança', async () => {
  const banco = bancoFalso({ semColuna: true })
  await comMetaFalsa({}, async ({ pedidos, gritos }) => {
    await guardarAnexosDoDirect(banco, CLINICA, 'mid5', [{ tipo: 'image', url: FOTO }])
    assert.deepEqual(pedidos, [])
    assert.match(gritos[0], /migration 20261108120000/)
  })
  assert.equal(banco.uploads.length, 0)
})

casoAssincrono('arquivo acima de 25 MB fica só com o link', async () => {
  const banco = bancoFalso()
  await comMetaFalsa(
    { [FOTO]: () => new Response('x', { headers: { 'content-type': 'video/mp4', 'content-length': String(TETO_DO_ANEXO + 1) } }) },
    async ({ gritos }) => {
      await guardarAnexosDoDirect(banco, CLINICA, 'mid6', [{ tipo: 'ig_reel', url: FOTO }])
      assert.match(gritos[0], /maior que 25 MB/)
    },
  )
  assert.equal(banco.uploads.length, 0)
})

for (const rodar of casosAssincronos) await rodar()

console.log(`instagram: ${ok} casos ok`)
