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
  hostDoToken,
} from './instagram.build.mjs'

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
  const d = decidirResposta({ texto: 'minha mae tem 82 anos e mora sozinha', respostas, estado: jaApresentado, agora })
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

console.log(`instagram: ${ok} casos ok`)
