// "Sobre a Dra. Patricia" para quem perguntou convenio ou preco, ou parou no
// pedido de consulta, e sumiu, e o menu de novo perto de fechar as 24h da Meta
// (07/11/2026, portado do sistema do Dr. Marcello). Dados inventados: o
// repositorio e publico.
import {
  AVISO_DO_MENU,
  marcaDoTexto,
  parouNoAgendamento,
  perguntouConvenioOuPreco,
  precisaDoMenuDeNovo,
  precisaDoSobre,
  SILENCIO_MS,
} from './depois-do-convenio.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

// Horas no relogio de Sao Paulo (UTC-3).
const sp = (dia, hora, minuto = 0) => new Date(Date.UTC(2026, 9, dia, hora + 3, minuto))
const msg = (direction, body, quando, automatic = direction === 'outbound') => ({
  direction, body, automatic, created_at: quando.toISOString(),
})

// --- A pergunta ---
for (const t of ['Atende convênio?', 'vcs aceitam unimed', 'Qual o valor da consulta?', 'quanto custa', 'é particular?', 'tem reembolso pelo plano de saúde?', 'Quanto é a consulta com o Dr?', 'PREÇO']) {
  confere(`pergunta reconhecida: "${t}"`, perguntouConvenioOuPreco(t))
}
for (const t of ['quero marcar', 'sexta, 30/10', 'meu filho tem refluxo', 'qual o plano de tratamento?', null]) {
  confere(`nao e pergunta de preco: "${t}"`, !perguntouConvenioOuPreco(t))
}

// --- Parou no agendamento ---
// O robo da Dra. mostra o valor dentro do pedido (pedido_valor, visita_valor):
// parar ali e o caso mais comum, e nao deixa pergunta de preco no historico.
for (const e of ['aguardando_unidade', 'aguardando_dia', 'aguardando_horario', 'aguardando_paciente', 'aguardando_convenio',
  'pedido_tipo', 'pedido_periodos', 'pedido_restricao', 'pedido_quando', 'pedido_valor',
  'visita_endereco', 'visita_restricao', 'visita_valor']) {
  confere(`etapa do pedido: ${e}`, parouNoAgendamento(e))
}
// Depois de aceitar o valor (nome, nascimento), o "Sobre a Dra." nao responde
// a duvida de ninguem.
for (const e of ['pedido_nome', 'pedido_nascimento', 'visita_nome', 'visita_nascimento', 'menu', 'atendente']) {
  confere(`fora do pedido ou depois do valor: ${e}`, !parouNoAgendamento(e))
}
for (const e of ['menu', 'atendente', 'dados_nome', 'minha_consulta', null, undefined]) {
  confere(`nao e agendamento parado: ${e}`, !parouNoAgendamento(e))
}

// --- Quando mandar o "Sobre" (6 horas) ---
// Caso do sistema de origem (23/10): perguntou do convenio, o robo respondeu e
// perguntou a unidade, e ela nao escreveu mais.
const joana = [
  msg('inbound', 'Oi, atende convênio?', sp(23, 9, 57)),
  msg('outbound', 'Não atendemos convênio... Em qual unidade você prefere ser atendido?', sp(23, 9, 58)),
]
confere('joana: 6h depois da resposta, manda', precisaDoSobre(joana, sp(23, 15, 58), false))
confere('joana: 5h50 depois, ainda espera', !precisaDoSobre(joana, sp(23, 15, 48), false))
confere('joana: 30 min depois (a regra antiga), ainda espera', !precisaDoSobre(joana, sp(23, 10, 29), false))
confere('ja recebeu antes: nao repete', !precisaDoSobre(joana, sp(23, 16, 30), true))

const respondeuDepois = [...joana, msg('inbound', 'Santos', sp(23, 10, 5))]
confere('o paciente respondeu depois: nao manda', !precisaDoSobre(respondeuDepois, sp(23, 16, 30), false))

const equipeEntrou = [...joana, msg('outbound', 'Oi Joana, posso ajudar?', sp(23, 10, 2), false)]
confere('a equipe escreveu depois: nao manda', !precisaDoSobre(equipeEntrou, sp(23, 16, 30), false))

// A equipe escreveu no meio e o robo respondeu depois: a conversa e da equipe.
const equipeNoMeio = [
  ...joana,
  msg('outbound', 'Oi Joana, posso ajudar?', sp(23, 10, 2), false),
  msg('outbound', 'Digite 0 para voltar ao início.', sp(23, 10, 3)),
]
confere('a equipe escreveu no meio, robo por ultimo: nao manda', !precisaDoSobre(equipeNoMeio, sp(23, 16, 30), false))
const semMarca = [...joana.slice(0, 1), { ...joana[1], automatic: null }]
confere('resposta sem marca de automatica: nao manda', !precisaDoSobre(semMarca, sp(23, 16, 30), false))

// Comecou a marcar e parou (26/10/2026): sem pergunta de preco, a etapa decide.
const parouNaUnidade = [
  msg('inbound', 'quero marcar', sp(23, 9, 0)),
  msg('outbound', 'Em qual unidade?', sp(23, 9, 1)),
]
confere('parou na unidade: 6h depois, manda', precisaDoSobre(parouNaUnidade, sp(23, 15, 2), false, 'aguardando_unidade'))
confere('parou na unidade: 5h depois, ainda espera', !precisaDoSobre(parouNaUnidade, sp(23, 14, 2), false, 'aguardando_unidade'))
confere('mesma conversa sem etapa de agendamento: nao manda', !precisaDoSobre(parouNaUnidade, sp(23, 15, 2), false, 'menu'))

// O caso da Dra.: o robo mostra o valor no meio do pedido, sem pergunta de
// preco, e a filha some depois de ver o valor.
const parouNoValor = [
  msg('inbound', 'Tarde', sp(23, 9, 0)),
  msg('outbound', '💳 *A consulta é particular*, sem convênio. Podemos seguir com o pedido?', sp(23, 9, 1)),
]
confere('parou no valor do pedido: 6h depois, manda', precisaDoSobre(parouNoValor, sp(23, 15, 2), false, 'pedido_valor'))
confere('parou no valor da visita em casa: 6h depois, manda', precisaDoSobre(parouNoValor, sp(23, 15, 2), false, 'visita_valor'))
confere('ja aceitou o valor e parou no nome: nao manda', !precisaDoSobre(parouNoValor, sp(23, 15, 2), false, 'pedido_nome'))
confere('na ficha (horario ja escolhido): nao manda', !precisaDoSobre(parouNaUnidade, sp(23, 15, 2), false, 'dados_cpf'))

// IA respondendo em mais de uma mensagem: vale a ultima nossa.
const duasRespostas = [
  msg('inbound', 'qual o valor?', sp(23, 10, 0)),
  msg('outbound', 'A consulta em Santos é...', sp(23, 10, 1)),
  msg('outbound', 'Quer ver os horários?', sp(23, 10, 20)),
]
confere('conta 6h da ULTIMA resposta nossa', !precisaDoSobre(duasRespostas, sp(23, 16, 10), false) && precisaDoSobre(duasRespostas, sp(23, 16, 21), false))

// Madrugada: perguntou 21h50, vence 3h51, sai as 8h do dia seguinte.
const noite = [
  msg('inbound', 'aceita amil?', sp(23, 21, 50)),
  msg('outbound', 'Não atendemos convênio...', sp(23, 21, 51)),
]
confere('madrugada: segura', !precisaDoSobre(noite, sp(24, 4, 0), false))
confere('7h59: ainda segura', !precisaDoSobre(noite, sp(24, 7, 59), false))
confere('8h do dia seguinte: manda', precisaDoSobre(noite, sp(24, 8, 0), false))

// Janela da Meta: 23h depois da pergunta, nao manda mais.
const velha = [
  msg('inbound', 'quanto custa', sp(23, 8, 30)),
  msg('outbound', 'A consulta é particular...', sp(23, 8, 31)),
]
confere('janela de 24h fechando: nao manda', !precisaDoSobre(velha, sp(24, 8, 0), false))
confere('ainda dentro da janela: manda', precisaDoSobre(velha, sp(23, 21, 0), false))

confere('conversa vazia nao quebra', !precisaDoSobre([], sp(23, 16, 0), false))
confere('so o paciente escreveu: nao manda', !precisaDoSobre([msg('inbound', 'valor?', sp(23, 9, 0))], sp(23, 16, 0), false))
confere('silencio de 6h', SILENCIO_MS === 6 * 3600 * 1000)
confere('marca do texto: 60 primeiros caracteres', marcaDoTexto('  ' + 'x'.repeat(100)).length === 60)

// --- O menu de novo, perto de fechar as 24h (26/10/2026) ---
// Perguntou o valor as 15h, recebeu a resposta e o "Sobre" as 21h01, e sumiu.
const comSobre = [
  msg('inbound', 'quanto custa a consulta?', sp(23, 15, 0)),
  msg('outbound', 'A consulta é particular...', sp(23, 15, 1)),
  msg('outbound', 'Oi! Passando para contar um pouco mais sobre a Dra. Patrícia...', sp(23, 21, 1)),
]
confere('menu: 22h depois do paciente, manda', precisaDoMenuDeNovo(comSobre, sp(24, 13, 0)))
confere('menu: 21h59 depois, ainda espera', !precisaDoMenuDeNovo(comSobre, sp(24, 12, 59)))
confere('menu: 23h45 depois, a janela fechou', !precisaDoMenuDeNovo(comSobre, sp(24, 14, 45)))
const jaMandado = [...comSobre, msg('outbound', `${AVISO_DO_MENU}\n\n*1* Dúvidas...`, sp(24, 13, 0))]
confere('menu ja mandado: nao repete', !precisaDoMenuDeNovo(jaMandado, sp(24, 14, 30)))
// Mandado ha mais de 2h (o silencio nao segura): so a marca do aviso segura.
const jaMandadoAntes = [...comSobre, msg('outbound', `${AVISO_DO_MENU}\n\n*1* Dúvidas...`, sp(24, 10, 0))]
confere('menu mandado horas antes: nao repete', !precisaDoMenuDeNovo(jaMandadoAntes, sp(24, 13, 0)))
const respondeu = [...comSobre, msg('inbound', 'obrigada, vou ver', sp(23, 21, 30))]
confere('o paciente respondeu: nao manda', !precisaDoMenuDeNovo(respondeu, sp(24, 13, 0)))
const equipe = [...comSobre, msg('outbound', 'Oi! Conseguiu ver os horários?', sp(24, 9, 0), false)]
confere('a equipe escreveu: nao manda', !precisaDoMenuDeNovo(equipe, sp(24, 13, 0)))
confere('sem pergunta de preco nem agendamento parado: nao manda', !precisaDoMenuDeNovo([
  msg('inbound', 'ok', sp(23, 15, 0)),
  msg('outbound', 'Por nada!', sp(23, 15, 1)),
], sp(24, 13, 0)))
// Agendamento parado tambem ganha o menu.
const parouNoDia = [
  msg('inbound', 'quero marcar', sp(23, 10, 0)),
  msg('outbound', 'Datas disponíveis...', sp(23, 10, 1)),
]
confere('parou no dia: menu 22h depois', precisaDoMenuDeNovo(parouNoDia, sp(24, 8, 30), 'aguardando_dia'))
// De madrugada nao sai: perguntou as 2h, a janela do menu cai na madrugada.
const madrugada = [
  msg('inbound', 'qual o valor?', sp(23, 2, 0)),
  msg('outbound', 'A consulta é particular...', sp(23, 2, 1)),
]
confere('menu de madrugada: nao sai', !precisaDoMenuDeNovo(madrugada, sp(24, 0, 30)))
// Mensagem nossa ha menos de 2h: nao cola o menu nela.
const recente = [
  msg('inbound', 'qual o valor?', sp(23, 10, 0)),
  msg('outbound', 'A consulta é particular...', sp(23, 10, 1)),
  msg('outbound', 'Bom dia! Estamos por aqui.', sp(24, 7, 30)),
]
confere('nossa ultima ha 1h: espera', !precisaDoMenuDeNovo(recente, sp(24, 8, 30)))
confere('nossa ultima ha 2h: manda', precisaDoMenuDeNovo(recente, sp(24, 9, 31)))

console.log(`depois do convenio: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}
