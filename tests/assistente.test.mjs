// Atendente com IA (porte de 28/10/2026, sistema do Dr. Marcello, 15/10/2026):
// as regras em volta do Claude, com um Claude de mentira. O que se testa aqui
// nao e o que o modelo diz - e o que o sistema faz com o que ele diz: quando
// ele nem e chamado, o que acontece quando falha, que o modo sombra nao mexe em
// nada, que CPF nao sai para fora, que o passo do valor e da pessoa, que a IA
// nao promete convenio e que o pedido anotado continua avisando a Dra.
//
// Dados inventados (repositorio publico): "José Teste da Silva", "Maria Teste".
import {
  atenderComAssistente,
  claudePelaApi,
  contaPiora,
  esperarOAssunto,
  ESPERA_DO_ASSUNTO,
  falaComAEquipe,
  ficaComORobo,
  lerModo,
  limparTexto,
  menuEscritoAMao,
  MODELO_PADRAO,
  montarSituacao,
  orientouConduta,
  pediuUrgencia,
  perguntaLateral,
  PRONTO_SOCORRO_AGORA,
  semConvenioPrometido,
  semDadosPessoais,
  semNarracao,
  semRepetir,
  sinalDeAlarme,
  SO_PARTICULAR,
  soFechamento,
} from './assistente.build.mjs'
import { tratarConversa } from './atendimento.build.mjs'
import { motivoDoAvisoDoPedido, deveAvisarPedido } from './alerta-de-urgencia.build.mjs'
import { bancoFalso } from './fixtures/banco-falso.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

// Os avisos de log das travas sao esperados aqui; o teste confere o efeito.
const avisos = []
console.warn = (...partes) => avisos.push(partes.map(String).join(' '))

const CONHECIMENTO = [
  '# Atendimentos',
  '## Consultório (Gonzaga)\nEndereço: Rua Teste, 1, Gonzaga, Santos\nConvênio: não atende convênio, consulta particular',
  '## Visita domiciliar\nNa casa do paciente.\nConvênio: não atende convênio, consulta particular',
  '# Valor da consulta (texto oficial)\nConsultório: R$ 400,00',
].join('\n\n')

const situacao = (extra = {}) => ({
  texto: 'A Dra. atende aos sábados?',
  anexo: false,
  etapa: null,
  ultimaDoConsultorio: null,
  historico: [{ de: 'pessoa', texto: 'Oi, meu CPF é 529.982.247-25, e-mail maria.teste@exemplo.com e telefone (13) 99999-0001' }],
  pacientes: ['José'],
  consultas: [],
  conhecimento: CONHECIMENTO,
  valor: '💚 Consulta no consultório: R$ 400,00.',
  quemAtende: 'a Dra. Patrícia',
  // Quarta, 14h em Sao Paulo: dentro do horario da equipe.
  agora: new Date('2026-10-28T17:00:00Z'),
  equipeConversando: false,
  ...extra,
})

/** Claude de mentira: devolve as respostas na ordem e guarda o que recebeu. */
function claudeFalso(respostas) {
  const chamadas = []
  const chamar = async (corpo) => {
    chamadas.push(corpo)
    const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]
    if (r instanceof Error) throw r
    return r
  }
  return { chamar, chamadas }
}
const texto = (t) => ({ content: [{ type: 'text', text: t }] })
const textoDoSistema = (chamada) => (Array.isArray(chamada?.system) ? chamada.system.map((b) => b.text).join('\n') : String(chamada?.system ?? ''))
const usa = (name, input, antes = '') => ({
  content: [...(antes ? [{ type: 'text', text: antes }] : []), { type: 'tool_use', id: `t-${name}`, name, input }],
})
// etapas[k] e a etapa do robo depois da chamada k+1; antes de qualquer uma, nenhuma.
function ferramentasFalsas({ etapas = [], respostasDoRobo = {} } = {}) {
  const feito = []
  let etapaAgora = null
  let feitas = 0
  return {
    feito,
    robo: async (t, etapa) => {
      feito.push(['robo', t, etapa])
      if (t === 'nao serve') return { resposta: 'Não entendi. Responda com o número.' }
      feitas++
      etapaAgora = etapas[feitas - 1] ?? etapaAgora
      if (respostasDoRobo[t]) return respostasDoRobo[t]
      return { resposta: `ROBO(${t})`, botoes: [{ id: '1', titulo: 'Um' }] }
    },
    horarios: async (l) => {
      feito.push(['horarios', l])
      return 'Consultório (Gonzaga): Segunda 02/11 de manhã; Quarta 04/11 à tarde.'
    },
    equipe: async (motivo, t, o) => {
      feito.push(['equipe', motivo, o?.manterEtapa ?? false])
      return { resposta: t, atencao: motivo }
    },
    etapa: async () => etapaAgora,
  }
}
const roboDireto = (r = { resposta: 'ROBO DIRETO' }) => {
  const chamado = { vezes: 0 }
  return { chamado, fn: async () => { chamado.vezes++; return r } }
}

// ---------------------------------------------------------------
// 1. Modos, chave e modelo
// ---------------------------------------------------------------
{
  const c = claudeFalso([texto('oi')])
  const rd = roboDireto()
  const d = await atenderComAssistente({ modo: 'desligado', situacao: situacao(), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: rd.fn })
  confere('desligado: robo responde', d.resultado?.resposta === 'ROBO DIRETO' && d.origem === 'robo')
  confere('desligado: Claude nao e chamado', c.chamadas.length === 0)
}
confere('modo desconhecido vale desligado', lerModo('qualquer') === 'desligado' && lerModo(null) === 'desligado' && lerModo('ligado') === 'ligado' && lerModo('sombra') === 'sombra')
confere('modelo e o mesmo do sistema do Dr. Marcello', MODELO_PADRAO === 'claude-sonnet-5-5')
{
  const rd = roboDireto()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao(), ferramentas: ferramentasFalsas(), chamar: null, roboDireto: rd.fn })
  confere('sem chave: robo responde', d.resultado?.resposta === 'ROBO DIRETO' && rd.chamado.vezes === 1)
  confere('sem chave: evento ia_falhou e grita no log', d.eventos.some((e) => e.evento === 'ia_falhou' && e.detalhe === 'sem chave') && avisos.some((a) => /sem ANTHROPIC_API_KEY/.test(a)))
}

// ---------------------------------------------------------------
// 2. Pergunta comum: o Claude responde, e o que vai para fora
// ---------------------------------------------------------------
{
  const c = claudeFalso([texto('A Dra. Patrícia atende no consultório de segunda a sexta.')])
  const rd = roboDireto()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao(), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: rd.fn })
  confere('ligado: resposta e do Claude', d.origem === 'ia' && d.resultado.resposta.startsWith('A Dra. Patrícia atende'))
  confere('ligado: robo nao roda', rd.chamado.vezes === 0)
  confere('ligado: evento ia_respondeu', d.eventos.some((e) => e.evento === 'ia_respondeu'))
  const enviado = JSON.stringify(c.chamadas[0])
  confere('CPF, e-mail e telefone nao saem para fora', !enviado.includes('529.982.247-25') && !enviado.includes('maria.teste@exemplo.com') && !enviado.includes('99999-0001') && enviado.includes('[cpf]') && enviado.includes('[e-mail]') && enviado.includes('[telefone]'))
  confere('chamada usa o modelo padrao', c.chamadas[0].model === 'claude-sonnet-5-5')
  const sistema = textoDoSistema(c.chamadas[0])
  confere('conhecimento da clinica vai nas instrucoes', sistema.includes('Rua Teste, 1, Gonzaga'))
  confere('instrucoes falam de adulto e idoso, nao de crianca', /pessoa idosa/.test(sistema) && !/crian[cç]a doente|mães, pais|gastroenterologista/.test(sistema))
  confere('instrucoes: consulta particular, sem prometer convenio', /A consulta é particular/.test(sistema))
  confere('instrucoes: o passo do valor e da pessoa', /passo do valor é do sistema/.test(sistema))
  confere('instrucoes: sem travessao nem meia-risca', !/[\u2013\u2014]/.test(sistema))
  confere('texto fixo marcado para cache', c.chamadas[0].system[0].cache_control?.type === 'ephemeral')
}
confere('semDadosPessoais: CPF sem pontuacao e celular com 55', semDadosPessoais('cpf 52998224725 fone +55 13 99999-0001') === 'cpf [cpf] fone [telefone]', semDadosPessoais('cpf 52998224725 fone +55 13 99999-0001'))

// ---------------------------------------------------------------
// 3. O que fica com o robo mesmo ligado
// ---------------------------------------------------------------
for (const [nome, extra] of [
  ['"e urgente" escrito', { texto: 'é urgente, preciso falar com a Dra.' }],
  ['anexo', { anexo: true, texto: '' }],
  ['equipe conversando', { equipeConversando: true }],
  ['resposta automatica de empresa', { texto: 'Imobiliária Teste agradece seu contato, aguarde um instante.' }],
  ['negou a consulta', { texto: 'Eu não passei em consulta com a doutora' }],
]) {
  const c = claudeFalso([texto('nao devia')])
  const rd = roboDireto()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao(extra), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: rd.fn })
  confere(`${nome}: fica com o robo`, d.origem === 'robo' && rd.chamado.vezes === 1 && c.chamadas.length === 0, JSON.stringify(ficaComORobo(situacao(extra))))
}
confere('"nao e urgente" nao e urgencia', !pediuUrgencia('Não é urgente, só queria saber o valor') && !ficaComORobo(situacao({ texto: 'Não é urgente, só queria saber o valor' })))
confere('"urgente" com laudo e sem sintoma e documento', !pediuUrgencia('preciso do laudo urgente, a perícia é sexta'))
confere('"urgente" com sintoma continua urgencia', pediuUrgencia('é urgente, ela está com febre'))

// ---------------------------------------------------------------
// 4. Sinais de alarme da pessoa adulta e idosa
// ---------------------------------------------------------------
for (const [frase, nome, risco] of [
  ['meu pai está com dor no peito desde cedo', 'dor no peito', 'vida'],
  ['minha mãe está com falta de ar', 'falta de ar', 'vida'],
  ['ela ficou com a boca torta e a fala enrolada agora', 'sinal de AVC', 'vida'],
  ['ele desmaiou no banheiro', 'desmaio', 'vida'],
  ['minha avó caiu e bateu a cabeça', 'queda com batida na cabeça', 'vida'],
  ['vomitou sangue hoje', 'vômito com sangue', 'vida'],
  ['de repente ficou confusa, não está falando coisa com coisa', 'confusão de repente', 'urgente'],
  ['febre de 39 desde ontem', 'febre alta', 'urgente'],
  ['ele não está comendo nada', 'não come nem bebe', 'urgente'],
  ['meu pai caiu da cama', 'queda', 'urgente'],
]) {
  const s = sinalDeAlarme(frase)
  confere(`sinal: "${frase}"`, s?.nome === nome && s?.risco === risco, JSON.stringify(s))
}
for (const frase of [
  'minha mãe teve AVC há dois anos e ficou com a fala enrolada, a Dra. atende em casa?',
  'ela não está com falta de ar, só cansada',
  'nunca desmaiou',
  'quanto custa a consulta?',
  'a ligação caiu',
]) {
  confere(`sem sinal: "${frase}"`, sinalDeAlarme(frase) === null, JSON.stringify(sinalDeAlarme(frase)))
}

// Risco de vida: resposta pronta, sem o Claude, e a conversa vai como urgencia.
{
  const c = claudeFalso([texto('nao devia')])
  const rd = roboDireto()
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'meu pai está com dor no peito e suando frio' }), ferramentas: f, chamar: c.chamar, roboDireto: rd.fn })
  confere('risco de vida: Claude nao e chamado', c.chamadas.length === 0)
  confere('risco de vida: pronto-socorro ou 192 na primeira frase', d.resultado.resposta.startsWith(PRONTO_SOCORRO_AGORA) && /192/.test(d.resultado.resposta.split('\n')[0]))
  confere('risco de vida: conversa vai como urgencia', d.resultado.atencao === 'urgencia' && f.feito.some(([q, m]) => q === 'equipe' && m === 'urgencia'))
  confere('risco de vida: nota para a equipe com o sinal', /dor no peito/.test(d.nota ?? ''))
  confere('risco de vida: nao e marcada como mensagem da IA', d.origem === 'robo')
}
{
  // Com a equipe na conversa, o risco de vida nao fica no silencio do robo.
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'ela desmaiou agora', equipeConversando: true }), ferramentas: ferramentasFalsas(), chamar: claudeFalso([texto('x')]).chamar, roboDireto: roboDireto(null).fn })
  confere('risco de vida com a equipe conversando: responde o pronto-socorro', d.resultado?.atencao === 'urgencia' && /pronto-socorro/.test(d.resultado?.resposta ?? ''))
}
{
  // A resposta pronta ja saiu: a pergunta seguinte vai para a IA, que le tudo.
  const c = claudeFalso([usa('chamar_equipe', { motivo: 'urgencia', para_pessoa: 'Procure agora o pronto-socorro mais próximo ou ligue 192. A equipe já está com a sua mensagem.', resumo_para_equipe: 'Dor no peito.' })])
  const d = await atenderComAssistente({
    modo: 'ligado',
    situacao: situacao({ texto: 'ele continua com dor no peito, levo de carro?', ultimaDoConsultorio: `${PRONTO_SOCORRO_AGORA}\n\nJá marquei a sua mensagem como urgente para a nossa equipe.`, urgenciaAberta: true }),
    ferramentas: ferramentasFalsas(),
    chamar: c.chamar,
    roboDireto: roboDireto().fn,
  })
  confere('risco de vida repetido: a IA responde', c.chamadas.length === 1 && d.resultado.atencao === 'urgencia')
}
{
  // Sinal urgente sem risco de vida: a IA conversa, e a conversa fica urgente
  // mesmo que ela esqueca de chamar a equipe.
  const c = claudeFalso([texto('Entendo a preocupação. A Dra. Patrícia avalia isso na consulta.')])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'minha mãe de repente ficou confusa desde ontem' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('sinal urgente: a IA e chamada', c.chamadas.length === 1)
  confere('sinal urgente sem chamar a equipe: marcado urgencia assim mesmo', d.resultado.atencao === 'urgencia')
  confere('sinal urgente: o rodape do pronto-socorro vai', /pronto-socorro mais próximo ou ligue 192/.test(d.resultado.resposta))
  confere('sinal urgente: o contexto avisa a IA', /sinal de urgência/.test(JSON.stringify(c.chamadas[0].messages)))
}

// ---------------------------------------------------------------
// 5. Falha da IA: o robo responde, e grita
// ---------------------------------------------------------------
{
  const c = claudeFalso([new Error('Claude recusou (529): overloaded')])
  const rd = roboDireto()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao(), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: rd.fn })
  confere('falha: o robo responde', d.resultado?.resposta === 'ROBO DIRETO' && d.origem === 'robo' && rd.chamado.vezes === 1)
  confere('falha: evento ia_falhou com o motivo', d.eventos.some((e) => e.evento === 'ia_falhou' && /529/.test(e.detalhe)))
}
{
  const c = claudeFalso([texto(''), texto('')])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao(), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('resposta vazia duas vezes: tenta de novo e cai no robo', c.chamadas.length === 2 && d.resultado?.resposta === 'ROBO DIRETO' && d.eventos.some((e) => e.evento === 'ia_falhou'))
}
{
  const c = claudeFalso([texto('x')])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao(), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn, prazoMs: 100 })
  confere('prazo esgotado: robo responde sem chamar o Claude', c.chamadas.length === 0 && d.resultado?.resposta === 'ROBO DIRETO' && d.eventos.some((e) => e.evento === 'ia_falhou' && /prazo/.test(e.detalhe)))
}
{
  // Na fila da equipe o robo cala; com a IA fora, silencio nunca.
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao(), ferramentas: f, chamar: claudeFalso([new Error('fora')]).chamar, roboDireto: roboDireto(null).fn })
  confere('falha com o robo calado: a pessoa sabe que a equipe viu', d.resultado?.atencao === 'atendente' && /já passei para a equipe/.test(d.resultado?.resposta ?? ''))
}
{
  // Sinal urgente e a IA fora: o robo daqui nao conhece o sinal, vai a resposta pronta.
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'meu pai está muito fraco, nem levanta' }), ferramentas: f, chamar: claudeFalso([new Error('fora')]).chamar, roboDireto: roboDireto().fn })
  confere('falha com sinal urgente: equipe com urgencia, nao o menu', d.resultado?.atencao === 'urgencia' && f.feito.some(([q, m]) => q === 'equipe' && m === 'urgencia'))
}

// ---------------------------------------------------------------
// 6. Abrir fluxo: os fluxos que existem aqui
// ---------------------------------------------------------------
{
  const c = claudeFalso([usa('abrir_fluxo', { fluxo: 'agendar', para_pessoa: 'Claro, vamos fazer o pedido!' }, 'A pessoa quer marcar, então abro o pedido.')])
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'quero marcar uma consulta para o meu pai' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('agendar: robo chamado com o pedido de marcar', f.feito.some(([q, t, e]) => q === 'robo' && t === 'quero marcar uma consulta' && e === 'nenhuma'))
  confere('agendar: para_pessoa + tela do robo com botoes, sem o rascunho', d.resultado.resposta === 'Claro, vamos fazer o pedido!\n\nROBO(quero marcar uma consulta)' && d.resultado.botoes?.length === 1, d.resultado.resposta)
}
for (const [fluxo, textoDoRobo, etapa] of [['minha_consulta', '4', 'menu'], ['segunda_via', '5', 'menu'], ['menu', 'menu', 'nenhuma']]) {
  const c = claudeFalso([usa('abrir_fluxo', { fluxo })])
  const f = ferramentasFalsas()
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'quero ver isso' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere(`${fluxo}: o caminho do menu de verdade`, f.feito.some(([q, t, e]) => q === 'robo' && t === textoDoRobo && e === etapa), JSON.stringify(f.feito))
}
{
  // O local e o tipo ja combinados seguem direto, com o numero da lista do robo.
  const lista = { resposta: '📍 *Vamos agendar!* Onde vai ser a consulta?\n\n*1* 🏥 Consultório (Gonzaga)\n*2* 🏠 Visita domiciliar\n\nResponda com o número.' }
  const f = ferramentasFalsas({ etapas: ['aguardando_unidade', 'pedido_tipo', 'pedido_periodos'], respostasDoRobo: { 'quero marcar uma consulta': lista } })
  const c = claudeFalso([usa('abrir_fluxo', { fluxo: 'agendar', local: 'consultório', tipo: 'retorno' })])
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'pode ser no consultório, é retorno' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('agendar com local: o numero do consultorio vai ao robo', f.feito.some(([q, t, e]) => q === 'robo' && t === '1' && e === 'atual'), JSON.stringify(f.feito))
  confere('agendar com tipo: "retorno" vai ao robo', f.feito.some(([q, t]) => q === 'robo' && t === 'retorno'))
}
{
  const lista = { resposta: '*1* 🏥 Consultório (Gonzaga)\n*2* 🏠 Visita domiciliar' }
  const f = ferramentasFalsas({ etapas: ['aguardando_unidade', 'visita_endereco'], respostasDoRobo: { 'quero marcar uma consulta': lista } })
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'quero a visita em casa' }), ferramentas: f, chamar: claudeFalso([usa('abrir_fluxo', { fluxo: 'agendar', local: 'em casa' })]).chamar, roboDireto: roboDireto().fn })
  confere('agendar em casa: o numero da visita vai ao robo', f.feito.some(([q, t]) => q === 'robo' && t === '2'))
}
{
  // O passo do valor nunca e respondido pelo atalho.
  const f = ferramentasFalsas({ etapas: ['pedido_valor'] })
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'quero marcar, é a primeira vez' }), ferramentas: f, chamar: claudeFalso([usa('abrir_fluxo', { fluxo: 'agendar', tipo: 'primeira' })]).chamar, roboDireto: roboDireto().fn })
  confere('atalho para no passo do valor', f.feito.filter(([q]) => q === 'robo').length === 1, JSON.stringify(f.feito))
}
{
  // Remarcar: o pedido vai junto, e o SIM e um passo a mais (a antiga continua
  // marcada ate a Dra. confirmar a nova).
  const f = ferramentasFalsas({ etapas: ['minha_consulta', 'confirmar_cancelamento', 'aguardando_unidade'] })
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'preciso remarcar a consulta do meu pai', consultas: ['qua, 04/11 09:00 · Consultório (Gonzaga) · José'] }), ferramentas: f, chamar: claudeFalso([usa('abrir_fluxo', { fluxo: 'remarcar' })]).chamar, roboDireto: roboDireto().fn })
  const roboFeito = f.feito.filter(([q]) => q === 'robo').map(([, t]) => t)
  confere('remarcar: menu 4, REMARCAR e SIM', JSON.stringify(roboFeito.slice(0, 3)) === JSON.stringify(['4', 'remarcar', 'sim']), JSON.stringify(roboFeito))
}
{
  const f = ferramentasFalsas({ etapas: ['minha_consulta', 'confirmar_cancelamento'] })
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'pode cancelar a consulta', consultas: ['qua, 04/11 09:00 · Consultório (Gonzaga) · José'] }), ferramentas: f, chamar: claudeFalso([usa('abrir_fluxo', { fluxo: 'cancelar' })]).chamar, roboDireto: roboDireto().fn })
  const roboFeito = f.feito.filter(([q]) => q === 'robo').map(([, t]) => t)
  confere('cancelar: espera o SIM da pessoa', JSON.stringify(roboFeito) === JSON.stringify(['4', 'cancelar']), JSON.stringify(roboFeito))
}
{
  // Pessoa sem cadastro neste telefone: o pedido segue, e a equipe fica sabendo.
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'quero marcar para a minha mãe, Maria' }), ferramentas: f, chamar: claudeFalso([usa('abrir_fluxo', { fluxo: 'agendar', paciente: 'Maria' })]).chamar, roboDireto: roboDireto().fn })
  confere('paciente sem cadastro: pedido segue com nota para a equipe', /Maria/.test(d.nota ?? '') && /não tem cadastro/.test(d.nota ?? '') && d.resultado.atencao === 'atendente')
}
{
  // Fluxo inventado volta para a IA corrigir.
  const c = claudeFalso([usa('abrir_fluxo', { fluxo: 'telemedicina' }), usa('abrir_fluxo', { fluxo: 'agendar' })])
  const f = ferramentasFalsas()
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'quero marcar' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('fluxo inexistente: a IA corrige e o robo abre o certo', c.chamadas.length === 2 && f.feito.some(([q, t]) => q === 'robo' && t === 'quero marcar uma consulta'))
}

// ---------------------------------------------------------------
// 7. Ver horarios: so leitura
// ---------------------------------------------------------------
{
  const c = claudeFalso([usa('ver_horarios', { local: 'todos' }), texto('A Dra. atende segunda de manhã e quarta à tarde. Quer que eu abra o pedido?')])
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'atende de manhã?' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('ver_horarios: consulta os periodos e responde', f.feito.some(([q, l]) => q === 'horarios' && l === 'todos') && /segunda de manhã/.test(d.resultado.resposta))
  confere('ver_horarios: nada vai ao robo', !f.feito.some(([q]) => q === 'robo'))
  confere('ver_horarios: o resultado volta para a IA', JSON.stringify(c.chamadas[1].messages).includes('Segunda 02/11'))
}

// ---------------------------------------------------------------
// 8. Chamar a equipe
// ---------------------------------------------------------------
{
  const c = claudeFalso([usa('chamar_equipe', { motivo: 'urgencia', para_pessoa: 'Entendo a preocupação. Já avisei a nossa equipe.', resumo_para_equipe: 'Febre alta desde ontem.' })])
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'meu pai está com febre de 39 desde ontem' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('urgencia: atencao urgencia', d.resultado.atencao === 'urgencia' && f.feito.some(([q, m]) => q === 'equipe' && m === 'urgencia'))
  confere('urgencia: rodape do pronto-socorro', /pronto-socorro mais próximo ou ligue 192/.test(d.resultado.resposta))
  confere('urgencia: resumo vira nota', /Febre alta desde ontem/.test(d.nota ?? ''))
}
{
  const c = claudeFalso([usa('chamar_equipe', { motivo: 'financeiro', para_pessoa: 'A família do José pergunta se dá para parcelar. Por favor, confirmem.', resumo_para_equipe: '' })])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'dá para parcelar?' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('recado para a equipe no texto da pessoa vira nota', d.resultado.resposta === 'Vou confirmar isso com a equipe e te respondemos por aqui.' && /Por favor, confirmem/.test(d.nota ?? ''), d.resultado.resposta)
}
{
  // Conduta numa mensagem com sintoma: sai a frase padrao.
  const c = claudeFalso([texto('Pode dar dipirona 500 mg de 6 em 6 horas.')])
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'meu pai está com dor de cabeça, posso dar remédio?' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('conduta: frase padrao, nada de dose', !/500 mg|dipirona/i.test(d.resultado.resposta) && /quem orienta é a Dra. Patrícia/.test(d.resultado.resposta), d.resultado.resposta)
  confere('conduta: nota conta o que a IA escreveu', /dipirona 500 mg/.test(d.nota ?? ''))
}
confere('recusa de conduta nao e conduta', !orientouConduta('Sobre a dipirona, quem orienta é a Dra. Patrícia.'))
confere('mandar parar remedio e conduta', orientouConduta('Suspenda o remédio até a consulta.'))
confere('nao dar nada tambem e conduta', orientouConduta('Quem orienta é a Dra., então não dê nada até ela responder.'))

// ---------------------------------------------------------------
// 9. Convenio: a consulta e particular
// ---------------------------------------------------------------
confere('convenio prometido sai', semConvenioPrometido('Sim, a Dra. atende pela Unimed!') === SO_PARTICULAR, semConvenioPrometido('Sim, a Dra. atende pela Unimed!'))
confere('"a consulta pode ser pelo plano" sai', !/pelo plano/.test(semConvenioPrometido('A consulta pode ser pelo plano. Quer marcar?')))
confere('reembolso fica', semConvenioPrometido('A consulta é particular, sem convênio, mas emitimos recibo para você pedir reembolso ao seu plano.') === 'A consulta é particular, sem convênio, mas emitimos recibo para você pedir reembolso ao seu plano.')
confere('negacao fica', semConvenioPrometido('A Dra. não atende convênio.') === 'A Dra. não atende convênio.')
confere('"atendemos particular... reembolso do plano" fica', semConvenioPrometido('Atendemos particular e emitimos recibo para reembolso do plano.') === 'Atendemos particular e emitimos recibo para reembolso do plano.')
{
  const c = claudeFalso([texto('Atende sim, a Dra. aceita Unimed e Amil. Quer que eu abra o pedido?')])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'aceita unimed?' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('IA dizendo que aceita convenio: a pessoa le que e particular', d.resultado.resposta.includes(SO_PARTICULAR) && !/aceita Unimed/.test(d.resultado.resposta), d.resultado.resposta)
}
{
  // Com convenio cadastrado num atendimento, a trava nao corta.
  const c = claudeFalso([texto('A Dra. atende pela Unimed no consultório.')])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'aceita unimed?', conhecimento: '## Consultório\nConvênio: Unimed' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('convenio cadastrado: a frase fica', d.resultado.resposta === 'A Dra. atende pela Unimed no consultório.')
}
{
  // No para_pessoa do fluxo tambem.
  const c = claudeFalso([usa('abrir_fluxo', { fluxo: 'agendar', para_pessoa: 'Pode ser pelo convênio, sim! A consulta é coberta pela Unimed.' })])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'quero marcar pela unimed' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('convenio prometido junto do fluxo sai', !/coberta pela Unimed/.test(d.resultado.resposta) && d.resultado.resposta.includes(SO_PARTICULAR), d.resultado.resposta)
}

// ---------------------------------------------------------------
// 10. Passos do pedido
// ---------------------------------------------------------------
{
  // O passo do valor: "seguir" so com o aceite da pessoa.
  const c = claudeFalso([usa('responder_etapa', { texto: '1', para_pessoa: 'O valor é o da mensagem acima; desconto quem confirma é a equipe.' })])
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({
    modo: 'ligado',
    situacao: situacao({ etapa: 'pedido_valor', texto: 'é caro, não tem desconto?', ultimaDoConsultorio: '💳 *A consulta é particular*, sem convênio.\n\nPodemos seguir com o pedido?' }),
    ferramentas: f,
    chamar: c.chamar,
    roboDireto: roboDireto({ resposta: 'Não entendi.' }).fn,
  })
  confere('valor sem aceite: o "seguir" da IA nao vai ao robo', !f.feito.some(([q, t]) => q === 'robo' && t === '1'), JSON.stringify(f.feito))
  confere('valor sem aceite: os botoes do valor voltam', d.resultado.botoes?.some((b) => b.titulo === 'Entendi, seguir') && /Entendi, seguir/.test(d.resultado.resposta))
}
{
  const c = claudeFalso([usa('responder_etapa', { texto: '1' })])
  const f = ferramentasFalsas()
  await atenderComAssistente({
    modo: 'ligado',
    situacao: situacao({ etapa: 'pedido_valor', texto: 'entendi sim, pode seguir obrigada' }),
    ferramentas: f,
    chamar: c.chamar,
    roboDireto: roboDireto({ resposta: 'Não entendi.' }).fn,
  })
  confere('valor com aceite dito: o "seguir" vai ao robo', f.feito.some(([q, t, e]) => q === 'robo' && t === '1' && e === 'mesma'))
}
{
  // So pergunta num passo de dado: o robo nao grava a pergunta como endereco.
  const c = claudeFalso([texto('Na visita, a Dra. vai até a casa do paciente.')])
  const rd = roboDireto({ resposta: 'ROBO GRAVOU' })
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ etapa: 'visita_endereco', texto: 'tem estacionamento?' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: rd.fn })
  confere('pergunta no passo do endereco: o robo nao grava', rd.chamado.vezes === 0 && c.chamadas.length === 1)
  confere('pergunta no passo do endereco: lembra o passo', /responder a pergunta acima/.test(d.resultado.resposta))
}
{
  // Nome com pergunta junto: a IA separa, e so o nome vai ao robo.
  const c = claudeFalso([usa('responder_etapa', { texto: 'José Teste da Silva', para_pessoa: 'O valor é o que aparece no pedido.' })])
  const f = ferramentasFalsas()
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ etapa: 'pedido_nome', texto: 'José Teste da Silva. Quanto custa?' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('nome com pergunta: so o nome vai ao robo', f.feito.some(([q, t, e]) => q === 'robo' && t === 'José Teste da Silva' && e === 'mesma'))
}
{
  // Nome que a pessoa nao escreveu nao entra no pedido.
  const c = claudeFalso([usa('responder_etapa', { texto: 'Consultório Gonzaga' })])
  const f = ferramentasFalsas()
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ etapa: 'pedido_nome', texto: 'pode ser no consultório?' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('passo de dado: texto inventado pela IA e recusado', !f.feito.some(([q]) => q === 'robo') && /pergunta acima/.test(d.resultado.resposta))
}
{
  // Pergunta junto do passo que o robo entendeu: a IA responde antes da tela, e
  // o pedido anotado continua com a etiqueta e os dados dele.
  const anotado = { resposta: '✅ *Pedido de consulta anotado.*', atencao: 'pedido_consulta', pedido: { tipo: 'consulta', paciente: 'José Teste da Silva' } }
  const c = claudeFalso([usa('chamar_equipe', { motivo: 'financeiro', para_pessoa: 'Sobre parcelar, a equipe confirma por aqui.', resumo_para_equipe: 'Quer parcelar.' })])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ etapa: 'pedido_nascimento', texto: '12/03/1940. Dá para parcelar?' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto(anotado).fn })
  confere('pergunta junto do ultimo passo: resposta da IA antes do resumo', d.resultado.resposta.startsWith('Sobre parcelar') && d.resultado.resposta.includes('Pedido de consulta anotado'))
  confere('pergunta junto do ultimo passo: o pedido continua com a etiqueta dele', d.resultado.atencao === 'pedido_consulta' && d.resultado.pedido?.paciente === 'José Teste da Silva')
}
{
  // Traduziu o periodo e o robo seguiu.
  const c = claudeFalso([usa('responder_etapa', { texto: '1, 2' })])
  const f = ferramentasFalsas()
  await atenderComAssistente({ modo: 'ligado', situacao: situacao({ etapa: 'pedido_periodos', texto: 'segunda de manhã ou quarta à tarde' }), ferramentas: f, chamar: c.chamar, roboDireto: roboDireto({ resposta: 'Não entendi. Responda com os números dos períodos que servem:' }).fn })
  confere('periodos escritos: a IA traduz para os numeros', f.feito.some(([q, t]) => q === 'robo' && t === '1, 2'))
}

// ---------------------------------------------------------------
// 11. Modo sombra: nada acontece de verdade
// ---------------------------------------------------------------
{
  const c = claudeFalso([usa('abrir_fluxo', { fluxo: 'agendar', para_pessoa: 'Vamos fazer o pedido!' })])
  const f = ferramentasFalsas()
  const rd = roboDireto()
  const d = await atenderComAssistente({ modo: 'sombra', situacao: situacao({ texto: 'quero marcar' }), ferramentas: f, chamar: c.chamar, roboDireto: rd.fn })
  confere('sombra: a resposta e do robo', d.resultado?.resposta === 'ROBO DIRETO' && d.origem === 'robo')
  confere('sombra: o robo de verdade nao recebe nada da IA', !f.feito.some(([q]) => q === 'robo' || q === 'equipe'))
  confere('sombra: nota com o que a IA faria', /modo sombra/.test(d.nota ?? '') && /Vamos fazer o pedido/.test(d.nota ?? ''))
}
{
  const d = await atenderComAssistente({ modo: 'sombra', situacao: situacao({ texto: 'ela está com falta de ar' }), ferramentas: ferramentasFalsas(), chamar: claudeFalso([texto('x')]).chamar, roboDireto: roboDireto().fn })
  confere('sombra com risco de vida: o robo responde e a nota mostra a resposta pronta', d.resultado?.resposta === 'ROBO DIRETO' && /pronto-socorro/.test(d.nota ?? ''))
}
{
  const d = await atenderComAssistente({ modo: 'sombra', situacao: situacao(), ferramentas: ferramentasFalsas(), chamar: claudeFalso([new Error('fora')]).chamar, roboDireto: roboDireto().fn })
  confere('sombra com falha: robo responde e o evento grita', d.resultado?.resposta === 'ROBO DIRETO' && d.eventos.some((e) => e.evento === 'ia_falhou'))
}

// ---------------------------------------------------------------
// 12. Travas do texto
// ---------------------------------------------------------------
confere('menu escrito a mao', menuEscritoAMao('1. Marcar\n2. Valores\n3. Equipe') && menuEscritoAMao('Responda com o número da opção'))
confere('menu com meia-risca tambem', menuEscritoAMao(`1 ${String.fromCharCode(0x2013)} Marcar\n2 ${String.fromCharCode(0x2013)} Valores\n3 ${String.fromCharCode(0x2013)} Equipe`))
confere('narracao sai', semNarracao('A pessoa quer marcar, então abro o pedido.\nClaro! Vamos lá.') === 'Claro! Vamos lá.', semNarracao('A pessoa quer marcar, então abro o pedido.\nClaro! Vamos lá.'))
confere('frase para a pessoa fica', semNarracao('A consulta é particular. Quer que eu abra o pedido?') === 'A consulta é particular. Quer que eu abra o pedido?')
confere('recado para a equipe reconhecido', falaComAEquipe('A filha pergunta se pode levar o exame. Por favor, confirmem.') && !falaComAEquipe('Você pode levar os exames recentes.'))
confere('pronto-socorro sai de duvida comum', limparTexto('A consulta dura uma hora. Se piorar, procure o pronto-socorro.', false) === 'A consulta dura uma hora.')
confere('pronto-socorro fica na urgencia', /pronto-socorro/.test(limparTexto('Procure o pronto-socorro agora.', true)))
confere('eco da pergunta sai', limparTexto('Você perguntou se a Dra. atende em casa. Atende sim!', false) === 'Atende sim!')
confere('frase repetida sai', semRepetir('Boa noite! Quando quiser, é só chamar aqui que a gente abre o pedido de consulta.', 'Tudo bem! Quando quiser, é só chamar aqui que a gente abre o pedido de consulta.') === 'Boa noite!')
confere('so fechamento', soFechamento('😊') && soFechamento('ok, obrigada') && !soFechamento('obrigada, e o valor?'))
confere('pergunta lateral no passo', perguntaLateral('José Teste. Quanto custa?') && !perguntaLateral('José Teste da Silva') && !perguntaLateral('retorno', true))
confere('piora contada, e a hipotetica nao', contaPiora('ela piorou, a febre subiu') && !contaPiora('e se a febre voltar, faço o quê?'))
{
  const base = { etapa: null, ultimaDoConsultorio: null, equipeConversando: false }
  confere('equipe sem assunto: pergunta o assunto', esperarOAssunto({ ...base, texto: 'quero falar com alguém' }) === 'esperar')
  confere('equipe de novo logo depois: vai a equipe', esperarOAssunto({ ...base, texto: 'falar com a equipe', ultimaDoConsultorio: ESPERA_DO_ASSUNTO }) === 'equipe')
  confere('o *3* do menu e pedido de equipe', esperarOAssunto({ ...base, texto: '3', ultimaDoConsultorio: '*3* 🗣️ Falar com alguém da equipe' }) === 'esperar')
}
{
  // Fechamento depois de uma mensagem sem pergunta: silencio, sem o Claude.
  const c = claudeFalso([texto('x')])
  const d = await atenderComAssistente({ modo: 'ligado', situacao: situacao({ texto: 'obrigada!', ultimaDoConsultorio: 'O valor é R$ 400,00.' }), ferramentas: ferramentasFalsas(), chamar: c.chamar, roboDireto: roboDireto().fn })
  confere('so fechamento: silencio e evento', d.resultado === null && c.chamadas.length === 0 && d.eventos.some((e) => e.evento === 'ia_calou_no_fechamento'))
}

// ---------------------------------------------------------------
// 13. A chamada a API
// ---------------------------------------------------------------
{
  const pedidos = []
  const buscar = async (url, init) => {
    pedidos.push({ url, init })
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'oi' }] }) }
  }
  const r = await claudePelaApi('chave-de-teste', buscar)({ model: MODELO_PADRAO, messages: [] }, 1000)
  const h = pedidos[0]?.init?.headers ?? {}
  confere('API: endereco e cabecalhos', pedidos[0]?.url === 'https://api.anthropic.com/v1/messages' && h['x-api-key'] === 'chave-de-teste' && h['anthropic-version'] === '2023-06-01')
  confere('API: corpo com o modelo', JSON.parse(pedidos[0].init.body).model === 'claude-sonnet-5-5' && r.content[0].text === 'oi')
  let erro = null
  try {
    await claudePelaApi('x', async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }))({}, 1000)
  } catch (e) {
    erro = e
  }
  confere('API: recusa vira erro com o motivo', /Claude recusou \(401\): invalid x-api-key/.test(String(erro)))
  let abortado = false
  try {
    await claudePelaApi('x', (_url, init) => new Promise((_, rejeita) => init.signal.addEventListener('abort', () => { abortado = true; rejeita(new Error('abortado')) })))({}, 20)
  } catch { /* esperado */ }
  confere('API: demora e cortada no prazo', abortado)
}

// ---------------------------------------------------------------
// 14. montarSituacao, com o banco falso
// ---------------------------------------------------------------
const CLINICA = 'clinica-teste'
function tabelasDaClinica(extra = {}) {
  return {
    clinics: [{ id: CLINICA, timezone: 'America/Sao_Paulo' }],
    clinic_settings: [{
      clinic_id: CLINICA,
      agendamento_por_pedido: true,
      telemedicine_enabled: false,
      telemedicine_info_text: '',
      whatsapp_profile_description: 'Consultório de teste.',
      assistente_ia_conhecimento: 'Atende adultos, com atenção especial à pessoa idosa.',
      domicilio_margem_minutos: 30,
    }],
    clinic_units: [
      { id: 'u-cons', clinic_id: CLINICA, name: 'Consultório (Gonzaga)', address: 'Rua Teste, 1, Gonzaga, Santos', info_text: 'Consulta no consultório.', accepts_insurance: null, is_home_visit: false, archived_at: null },
      { id: 'u-casa', clinic_id: CLINICA, name: 'Visita domiciliar', address: '', info_text: 'Consulta em casa.', accepts_insurance: null, is_home_visit: true, archived_at: null },
    ],
    bot_answers: [
      { id: 'b1', clinic_id: CLINICA, subject: 'Valor e pagamento', keywords: ['valor', 'quanto'], answer: '💚 Consulta: R$ 400,00.', ask_unit: false, is_active: true, position: 10 },
      { id: 'b2', clinic_id: CLINICA, subject: 'Convênios', keywords: ['convenio'], answer: 'O atendimento é particular, sem convênio.', ask_unit: false, is_active: true, position: 20 },
    ],
    availability_rules: [],
    schedule_exceptions: [],
    appointments: [],
    whatsapp_conversations: [{ id: 'conv-1', clinic_id: CLINICA, booking_state: null, booking_options: null, booking_unit_id: null, booking_patient_id: null, booking_replaces_id: null, booking_intake_id: null, booking_modality: null }],
    whatsapp_messages: [
      { conversation_id: 'conv-1', direction: 'inbound', body: 'Oi, meu CPF é 529.982.247-25', created_at: '2026-10-28T12:00:00Z' },
      { conversation_id: 'conv-1', direction: 'outbound', body: 'Olá! Como podemos ajudar?', created_at: '2026-10-28T12:00:05Z' },
      { conversation_id: 'conv-1', direction: 'inbound', body: 'quanto custa?', created_at: '2026-10-28T12:01:00Z' },
    ],
    ...extra,
  }
}
{
  const banco = bancoFalso(tabelasDaClinica())
  const s = await montarSituacao(banco, {
    clinicId: CLINICA, conversationId: 'conv-1', texto: 'quanto custa?', anexo: false, etapa: null,
    pacientes: [], consultas: [{ id: 'a1', inicio: '2026-11-04T12:00:00Z', unidade: 'Consultório (Gonzaga)', endereco: '', paciente: 'José Teste da Silva', confirmada: true }],
    quemAtende: 'a Dra. Patrícia', agora: new Date('2026-10-28T17:00:00Z'), equipeConversando: false,
  })
  confere('situacao: a mensagem nova sai do historico', s.historico.length === 2 && s.historico[0].de === 'pessoa' && s.ultimaDoConsultorio === 'Olá! Como podemos ajudar?')
  confere('situacao: conhecimento com os atendimentos e o texto livre', s.conhecimento.includes('## Consultório (Gonzaga)') && s.conhecimento.includes('pessoa idosa') && s.conhecimento.includes('Consultório de teste.'))
  confere('situacao: particular derivado dos dados', s.conhecimento.includes('Convênio: não atende convênio') && s.conhecimento.includes('O atendimento é particular: nenhum atendimento aceita convênio'))
  confere('situacao: agenda por pedido explicada', /confirma o dia e o horário por aqui/.test(s.conhecimento))
  confere('situacao: visita em Santos e São Vicente', /Santos e São Vicente/.test(s.conhecimento))
  confere('situacao: valor oficial', s.valor === '💚 Consulta: R$ 400,00.' && s.conhecimento.includes('R$ 400,00'))
  confere('situacao: consulta com o primeiro nome', s.consultas[0].endsWith('· Consultório (Gonzaga) · José'))
}
{
  // Sem a tabela das mensagens nem das respostas: a IA responde com menos, e nada quebra.
  const banco = bancoFalso(tabelasDaClinica(), { semTabela: ['whatsapp_messages', 'bot_answers'] })
  const s = await montarSituacao(banco, { clinicId: CLINICA, conversationId: 'conv-1', texto: 'oi', anexo: false, etapa: null, pacientes: [], consultas: [], quemAtende: 'a Dra. Patrícia', agora: new Date(), equipeConversando: false })
  confere('situacao sem tabelas: segue sem historico e sem valor', s.historico.length === 0 && s.valor === null && s.conhecimento.includes('Valor ainda não cadastrado'))
}
{
  // Valor com "R$ ___" nao e valor: a IA fica sabendo que nao ha preco.
  const banco = bancoFalso(tabelasDaClinica({ bot_answers: [{ id: 'b1', clinic_id: CLINICA, subject: 'Valor e pagamento', keywords: ['valor'], answer: 'Consulta: R$ ___', ask_unit: false, is_active: true, position: 10 }] }))
  const s = await montarSituacao(banco, { clinicId: CLINICA, conversationId: 'conv-1', texto: 'oi', anexo: false, etapa: null, pacientes: [], consultas: [], quemAtende: 'a Dra. Patrícia', agora: new Date(), equipeConversando: false })
  confere('situacao: valor em branco nao vira numero', s.valor === null && /não informe valor/.test(s.conhecimento))
}

// ---------------------------------------------------------------
// 15. Com o robo de verdade: o pedido inteiro, o valor e o aviso
// ---------------------------------------------------------------
{
  const banco = bancoFalso(tabelasDaClinica({ whatsapp_messages: [] }))
  const conversa = () => banco.db.whatsapp_conversations[0]
  const base = (texto) => ({
    admin: banco, clinicId: CLINICA, conversationId: 'conv-1', podeIniciarMenu: true, equipeConversando: false, tituloDoToque: '',
    anexo: false, jaViuOMenu: true, respostasNaEspera: 0, texto, telefone: '5513999990001', pacientes: [],
    consultas: [], nomeDoPerfil: 'Maria Teste', convenioEmAndamento: null,
    textos: { saudacao: 'Olá!', saudacaoConhecida: '', informacoes: '' },
  })
  const comEstado = (texto, c = conversa()) => ({
    ...base(texto),
    estadoAtual: c.booking_state, opcoesAtuais: c.booking_options, unidadeEmAndamento: c.booking_unit_id,
    pacienteEmAndamento: c.booking_patient_id, consultaASubstituir: c.booking_replaces_id, consultaEmCadastro: c.booking_intake_id,
    modalidadeEmAndamento: c.booking_modality,
  })
  // As ferramentas como o webhook monta (ver meta-webhook/index.ts).
  const ferramentasReais = (estadoNaChegada) => ({
    robo: async (texto, etapa) => {
      if (etapa === 'atual') return tratarConversa(comEstado(texto))
      return tratarConversa({ ...comEstado(texto, estadoNaChegada), estadoAtual: etapa === 'mesma' ? estadoNaChegada.booking_state : etapa === 'menu' ? 'menu' : null, opcoesAtuais: etapa === 'mesma' ? estadoNaChegada.booking_options : null })
    },
    horarios: async () => 'Consultório (Gonzaga): sem horário de atendimento cadastrado.',
    equipe: async (motivo, t) => ({ resposta: t, atencao: motivo }),
    etapa: async () => conversa().booking_state,
  })
  const mensagem = async (texto, respostasDoClaude) => {
    const estadoNaChegada = { ...conversa() }
    const s = situacao({ texto, etapa: estadoNaChegada.booking_state, pacientes: [], historico: [] })
    return atenderComAssistente({
      modo: 'ligado', situacao: s, ferramentas: ferramentasReais(estadoNaChegada), chamar: claudeFalso(respostasDoClaude).chamar,
      roboDireto: () => tratarConversa(comEstado(texto, estadoNaChegada)),
    })
  }

  const d1 = await mensagem('quero marcar uma primeira consulta no consultório', [usa('abrir_fluxo', { fluxo: 'agendar', local: 'consultório', tipo: 'primeira' })])
  confere('real: local e tipo seguem ate a restricao', conversa().booking_state === 'pedido_restricao', String(conversa().booking_state))
  confere('real: a pessoa le a pergunta da restricao', /restrição de dia ou horário/.test(d1.resultado?.resposta ?? ''), d1.resultado?.resposta)
  await mensagem('não tenho', [texto('nao devia')])
  confere('real: "a partir de quando" pelo robo', conversa().booking_state === 'pedido_quando')
  const d3 = await mensagem('tanto faz', [texto('nao devia')])
  confere('real: o passo do valor aparece para quem nao e paciente', conversa().booking_state === 'pedido_valor' && /particular/.test(d3.resultado?.resposta ?? '') && /R\$ 400,00/.test(d3.resultado?.resposta ?? ''))
  const d4 = await mensagem('é caro, aceita cartão?', [texto('As formas de pagamento são confirmadas no pedido.')])
  confere('real: duvida no passo do valor nao passa o passo', conversa().booking_state === 'pedido_valor', String(conversa().booking_state))
  confere('real: a duvida e respondida e o botao continua', /formas de pagamento/.test(d4.resultado?.resposta ?? '') && d4.resultado?.botoes?.some((b) => b.titulo === 'Entendi, seguir'), d4.resultado?.resposta)
  await mensagem('1', [texto('nao devia')])
  confere('real: "Entendi, seguir" da pessoa leva ao nome', conversa().booking_state === 'pedido_nome')
  await mensagem('José Teste da Silva', [texto('nao devia')])
  const d7 = await mensagem('12/03/1940', [texto('nao devia')])
  confere('real: pedido anotado com os dados para o aviso', d7.resultado?.atencao === 'pedido_consulta' && d7.resultado?.pedido?.paciente === 'José Teste da Silva' && d7.resultado?.pedido?.consulta === 'Primeira consulta')
  confere('real: o aviso do pedido sai', deveAvisarPedido({ atencaoAntes: false, motivoAntes: null, atencaoAgora: motivoDoAvisoDoPedido(d7.resultado) }) === 'novo')
}
confere('aviso do pedido: o pedido vence a urgencia da mesma mensagem', motivoDoAvisoDoPedido({ atencao: 'urgencia', pedido: { tipo: 'consulta' } }) === 'pedido_consulta')
confere('aviso do pedido: visita', motivoDoAvisoDoPedido({ atencao: 'atendente', pedido: { tipo: 'visita' } }) === 'visita')
confere('aviso do pedido: sem pedido, a etiqueta', motivoDoAvisoDoPedido({ atencao: 'urgencia' }) === 'urgencia' && motivoDoAvisoDoPedido(null) === null)

// ---------------------------------------------------------------
// 16. Repositorio publico: so dado inventado neste arquivo
// ---------------------------------------------------------------
{
  const { readFileSync } = await import('node:fs')
  const fonte = readFileSync(new URL(import.meta.url), 'utf8')
  confere('sem travessao nem meia-risca neste arquivo', !/[\u2013\u2014]/.test(fonte))
  const assistente = readFileSync(new URL('../supabase/functions/_shared/assistente.ts', import.meta.url), 'utf8')
  confere('sem travessao nem meia-risca em assistente.ts', !/[\u2013\u2014]/.test(assistente))
}

console.log(`atendente com IA: ${ok} verificacoes ok, ${falhas.length} falha(s)`)
if (falhas.length) {
  for (const f of falhas) console.log(`FALHOU: ${f}`)
  process.exit(1)
}
