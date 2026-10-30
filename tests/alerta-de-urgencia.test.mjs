// Aviso do pedido no WhatsApp pessoal da Dra. Patricia (28/10/2026). Porte de
// tests/alerta-de-urgencia.test.mjs do sistema do Dr. Marcello. Regra em
// supabase/functions/_shared/alerta-de-urgencia.ts. Sem Meta e sem banco: um
// fetch de mentira e um banco em memoria. Numeros e nomes inventados: o
// repositorio e publico.
import {
  descreverEnvio,
  deveAvisarDuvida,
  deveAvisarPedido,
  enviarAviso,
  MODELO_DA_DUVIDA,
  MODELO_DO_PEDIDO,
  MODELO_DO_PEDIDO_SIMPLES,
  numerosDoAlerta,
  parametrosDoAviso,
  quemDoPedido,
  resumoDaDuvida,
  resumoDaIA,
  resumoDoPedido,
} from './alerta-de-urgencia.build.mjs'
import { textoDoModelo } from './modelos.build.mjs'
import { bancoFalso } from './fixtures/banco-falso.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

// O token do WhatsApp vem do ambiente do Deno; aqui, de mentira.
globalThis.Deno = { env: { get: (nome) => (nome === 'WHATSAPP_ACCESS_TOKEN' ? 'token-de-teste' : undefined) } }

const DRA = '5513999990001'
const EQUIPE = '5511988880002'

// 1. Numeros: 55 + DDD + celular com o 9, sem repetir, sem lixo, na ordem.
{
  const n = numerosDoAlerta('(13) 99999-0001\n13999990001, 5513999990001\n123\n(11) 98888-0002')
  confere('numeros: normaliza, nao repete e guarda a ordem', JSON.stringify(n) === JSON.stringify([DRA, EQUIPE]), JSON.stringify(n))
  confere('numeros: lista do banco', numerosDoAlerta([DRA]).length === 1)
  confere('numeros: nada', numerosDoAlerta(null).length === 0 && numerosDoAlerta('').length === 0)
  confere('numeros: poe o nono digito', numerosDoAlerta('13 9999-0001')[0] === DRA, JSON.stringify(numerosDoAlerta('13 9999-0001')))
}

// 2. So quando a conversa ENTRA no pedido.
const entra = (antes, agora) => deveAvisarPedido({ atencaoAntes: antes.atencao, motivoAntes: antes.motivo, atencaoAgora: agora })
confere('entrada: conversa nova pede consulta', entra({ atencao: false, motivo: null }, 'pedido_consulta') === 'novo')
confere('entrada: pedido de visita tambem avisa', entra({ atencao: false, motivo: null }, 'visita') === 'novo')
confere('entrada: da fila do atendente para o pedido', entra({ atencao: true, motivo: 'atendente' }, 'pedido_consulta') === 'novo')
confere('entrada: de pedido de consulta para visita e outro pedido', entra({ atencao: true, motivo: 'pedido_consulta' }, 'visita') === 'novo')
confere('entrada: mesmo pedido com a conversa acesa nao e novo', entra({ atencao: true, motivo: 'pedido_consulta' }, 'pedido_consulta') === 'repetido')
confere('entrada: pedido resolvido e pedido novo avisa de novo', entra({ atencao: false, motivo: 'pedido_consulta' }, 'pedido_consulta') === 'novo')
confere('entrada: mensagem seguinte (sem motivo no resultado) nao avisa', entra({ atencao: true, motivo: 'pedido_consulta' }, undefined) === null)
confere('entrada: outro motivo nao avisa', entra({ atencao: false, motivo: null }, 'atendente') === null && entra({ atencao: false, motivo: null }, 'urgencia') === null)

// 3. O resumo e os parametros que a Meta aceita.
{
  const consulta = resumoDoPedido({
    tipo: 'consulta',
    paciente: 'Maria Teste',
    consulta: 'Primeira consulta',
    unidade: 'Consultório (Gonzaga)',
    periodos: ['Segunda de manhã', 'Terça à tarde'],
    aPartir: 'Próxima semana',
    restricao: 'só à tarde.',
  })
  confere(
    'resumo: consulta numa frase',
    consulta === 'Primeira consulta, Consultório (Gonzaga). Pode: Segunda de manhã ou Terça à tarde. A partir de: Próxima semana. Restrição: só à tarde.',
    consulta,
  )
  const visita = resumoDoPedido({ tipo: 'visita', endereco: 'Rua Fictícia, 10, Gonzaga', substitui: true })
  confere('resumo: visita com endereco e sem restricao', visita === 'Visita em casa: Rua Fictícia, 10, Gonzaga. Sem restrição de dia ou horário. No lugar de uma consulta já marcada.', visita)
  confere('quem: paciente do pedido primeiro', quemDoPedido({ paciente: 'José Teste', nomeDoPerfil: 'Filha do José' }) === 'José Teste')
  confere('quem: sem paciente, o perfil', quemDoPedido({ paciente: null, nomeDoPerfil: 'Filha do José' }) === 'Filha do José')
  confere('quem: sem nome, so o final do telefone', quemDoPedido({ telefone: '5513977770003' }) === 'Contato final 0003', quemDoPedido({ telefone: '5513977770003' }))
  confere('quem: o unico paciente do telefone', quemDoPedido({ pacientes: [{ name: 'Ana Teste' }], telefone: '5513977770003' }) === 'Ana Teste')

  const p = parametrosDoAviso({
    quem: 'Maria\nTeste',
    resumo: 'Primeira consulta.\n\nRestrição: me liga no (13) 97777-0003    ou maria@exemplo.com, CPF 390.533.447-05 ' + 'x'.repeat(400),
    agora: new Date('2026-10-28T17:32:00Z'),
  })
  confere('parametros: tres', p.length === 3)
  confere('parametros: hora de Brasilia', p[1] === '14:32', p[1])
  confere('parametros: sem quebra de linha, tabulacao nem espacos seguidos', p.every((x) => !/[\n\t]| {4,}/.test(x)), JSON.stringify(p))
  confere(
    'parametros: sem CPF, telefone nem e-mail',
    !p[2].includes('390.533.447-05') && !p[2].includes('97777-0003') && !p[2].includes('maria@exemplo.com') && p[2].includes('[cpf]') && p[2].includes('[telefone]'),
    p[2],
  )
  confere('parametros: resumo cortado em 300', p[2].length <= 300 && p[2].endsWith('…'), String(p[2].length))
  confere('parametros: vazio vira traco', parametrosDoAviso({ quem: '', resumo: '', agora: new Date() }).every((x, i) => i === 1 || x === '-'))

  const corpo = textoDoModelo(MODELO_DO_PEDIDO, p) ?? ''
  confere('modelo: texto registrado igual ao de MODELOS-META.md', corpo.startsWith('📅 Novo pedido de consulta na Central de Cuidado.\n\nMaria Teste escreveu às 14:32:') && corpo.endsWith('[Eu respondo · Mandar os valores]'), corpo.slice(0, 120))
  confere('modelo: cabe no limite da Meta', corpo.length <= 1024, String(corpo.length))
  confere('modelo simples: sem botoes', !(textoDoModelo(MODELO_DO_PEDIDO_SIMPLES, p) ?? '[Eu respondo').includes('[Eu respondo'))
}

// 4. O que fica registrado.
{
  const certo = descreverEnvio([{ numero: DRA, ok: true }])
  confere('registro: enviado vira nota', !certo.falhou && certo.detalhe === 'enviado 1/1' && certo.nota === '📱 Aviso do pedido enviado para o WhatsApp da Dra. Patrícia.', certo.nota)
  const dois = descreverEnvio([{ numero: DRA, ok: true }, { numero: EQUIPE, ok: true, semBotoes: true }])
  confere('registro: diz quando foi sem botoes', dois.nota.includes('e para final 0002') && dois.nota.includes('Foi sem os botões') && dois.detalhe === 'enviado 2/2 sem botoes', dois.nota)
  const semModelo = descreverEnvio([{ numero: DRA, ok: false, erro: '(#132001) Template name does not exist in the translation' }, { numero: EQUIPE, ok: true }])
  confere('registro: falha grita e manda ligar para a Dra.', semModelo.falhou && semModelo.nota.startsWith('⚠️ O aviso do pedido NÃO chegou ao celular final 0001 (Dra. Patrícia)') && semModelo.nota.includes('Avise a Dra. Patrícia por telefone'), semModelo.nota)
  confere('registro: modelo nao aprovado explicado', semModelo.nota.includes('o modelo aviso_pedido_consulta_simples ainda não foi aprovado na Meta'), semModelo.nota)
  confere('registro: diz para quem chegou', semModelo.nota.includes('Chegou a final 0002'), semModelo.nota)
  confere('registro: detalhe cabe na coluna', semModelo.detalhe.length <= 120)
  const soEquipe = descreverEnvio([{ numero: DRA, ok: true }, { numero: EQUIPE, ok: false, erro: 'erro' }])
  confere('registro: chegou a Dra., nao manda ligar', soEquipe.falhou && !soEquipe.nota.includes('por telefone'), soEquipe.nota)
}

// 5. Envio de ponta a ponta, com Meta e banco de mentira.
const AGORA = new Date('2026-10-28T17:32:00Z')
const pedido = {
  motivo: 'pedido',
  clinicId: 'c1',
  quem: 'Maria Teste',
  resumo: 'Primeira consulta, Consultório (Gonzaga). Sem restrição de dia ou horário.',
  agora: AGORA,
  conversaWhatsApp: 'conv-1',
}
const banco = ({ numeros = [DRA, EQUIPE], alertas = [], semTabela = [] } = {}) =>
  bancoFalso(
    {
      clinic_settings: [{ clinic_id: 'c1', whatsapp_phone_number_id: '123', whatsapp_template_language: 'pt_BR', alerta_urgencia_telefones: numeros }],
      alertas_de_urgencia: alertas,
      conversation_notes: [],
      whatsapp_bot_events: [],
    },
    { semTabela },
  )
/** Banco sem a coluna dos numeros: o Postgres recusa o SELECT inteiro. */
function semColuna(b) {
  return {
    db: b.db,
    from(tabela) {
      const q = b.from(tabela)
      if (tabela !== 'clinic_settings') return q
      const select = q.select
      q.select = (colunas) => {
        if (String(colunas).includes('alerta_urgencia_telefones')) {
          return { eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'column clinic_settings.alerta_urgencia_telefones does not exist' } }) }) }
        }
        return select(colunas)
      }
      return q
    },
  }
}
/** A Meta de mentira: responde com Response de verdade (postarNaMeta usa clone). */
function meta(decidir = () => ({ corpo: { messages: [{ id: 'wamid' }] } })) {
  const enviados = []
  return {
    enviados,
    buscar: async (url, init) => {
      const corpo = JSON.parse(init.body)
      enviados.push({ url, corpo })
      const r = decidir(corpo, enviados.length)
      return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200 })
    },
  }
}
const naoAprovado = { status: 404, corpo: { error: { code: 132001, message: 'Template name does not exist in the translation' } } }

{
  const b = banco()
  const m = meta((corpo, n) => ({ corpo: { messages: [{ id: `wamid.${n}` }] } }))
  const r = await enviarAviso(b, pedido, m.buscar)
  const registrado = b.db.alertas_de_urgencia[0]
  confere('envio: um por numero, na ordem', r.length === 2 && r.every((e) => e.ok) && m.enviados[0].corpo.to === DRA && m.enviados[1].corpo.to === EQUIPE, JSON.stringify(r))
  confere('envio: pelo numero do robo', m.enviados[0].url.endsWith('/123/messages'), m.enviados[0].url)
  confere('envio: aviso registrado antes, como pedido', registrado?.motivo === 'pedido' && registrado.conversa_whatsapp === 'conv-1' && registrado.teste === false && registrado.quem === 'Maria Teste', JSON.stringify(registrado))
  const t = m.enviados[0].corpo.template
  confere('envio: modelo com botoes', m.enviados[0].corpo.type === 'template' && t.name === 'aviso_pedido_consulta', JSON.stringify(t))
  const botoes = t.components.filter((c) => c.type === 'button')
  confere(
    'envio: o payload do botao leva ao aviso certo',
    botoes.length === 2 && botoes[0].parameters[0].payload === `PED:${registrado.id}:responde` && botoes[1].parameters[0].payload === `PED:${registrado.id}:valores` && botoes[1].index === '1',
    JSON.stringify(botoes),
  )
  const parametros = t.components[0].parameters.map((x) => x.text)
  confere('envio: tres parametros, sem quebra de linha', parametros.length === 3 && parametros.every((x) => !/\n/.test(x)), JSON.stringify(parametros))
  confere('envio: ids das mensagens e resultado guardados', JSON.stringify(registrado.mensagens) === JSON.stringify(['wamid.1', 'wamid.2']) && registrado.resultado === 'enviado 2/2', JSON.stringify(registrado))
  const nota = b.db.conversation_notes[0]?.texto ?? ''
  confere('envio: vira nota na conversa', nota === '📱 Aviso do pedido enviado para o WhatsApp da Dra. Patrícia e para final 0002.' && b.db.conversation_notes[0].conversation_id === 'conv-1', nota)
  confere('envio: evento nos numeros', b.db.whatsapp_bot_events.some((e) => e.evento === 'aviso_pedido' && e.detalhe === 'enviado 2/2'))
}
{
  // Modelo com botoes ainda em analise: cai no sem botoes, e o resto ja vai direto.
  const b = banco()
  const m = meta((corpo) => (corpo.template.name === 'aviso_pedido_consulta' ? naoAprovado : { corpo: { messages: [{ id: 'w' }] } }))
  const r = await enviarAviso(b, pedido, m.buscar)
  const nomes = m.enviados.map((e) => e.corpo.template.name)
  confere('em analise: cai no modelo sem botoes e o resto vai direto', JSON.stringify(nomes) === JSON.stringify(['aviso_pedido_consulta', 'aviso_pedido_consulta_simples', 'aviso_pedido_consulta_simples']) && r.every((e) => e.ok), JSON.stringify(nomes))
  confere('em analise: o simples vai sem componente de botao', m.enviados[1].corpo.template.components.every((c) => c.type !== 'button'))
  confere('em analise: a nota diz que foi sem botoes', (b.db.conversation_notes[0]?.texto ?? '').includes('Foi sem os botões'), b.db.conversation_notes[0]?.texto)
}
{
  // Nenhum dos dois aprovado: nada chega, a nota manda ligar e a reserva grita.
  const b = banco({ numeros: [DRA] })
  const reservas = []
  const r = await enviarAviso(b, { ...pedido, reserva: async (titulo, corpo) => reservas.push({ titulo, corpo }) }, meta(() => naoAprovado).buscar)
  const nota = b.db.conversation_notes[0]?.texto ?? ''
  confere('recusa: nao lanca e registra', r.length === 1 && !r[0].ok)
  confere('recusa: a nota grita e manda ligar', nota.startsWith('⚠️') && nota.includes('NÃO chegou') && nota.includes('por telefone'), nota)
  confere('recusa: a notificacao da equipe vai de reserva', reservas.length === 1 && reservas[0].titulo.includes('não chegou ao WhatsApp da Dra.'), JSON.stringify(reservas))
  confere('recusa: o resultado fica no aviso', b.db.alertas_de_urgencia[0].resultado.startsWith('falhou 1/1'), b.db.alertas_de_urgencia[0].resultado)
}
{
  // Chegou a alguem: a reserva nao toca.
  const b = banco()
  const reservas = []
  await enviarAviso(b, { ...pedido, reserva: async (t) => reservas.push(t) }, meta((corpo) => (corpo.to === EQUIPE ? { status: 400, corpo: { error: { message: 'erro' } } } : { corpo: { messages: [{ id: 'w' }] } })).buscar)
  confere('parcial: sem reserva quando chegou a Dra.', reservas.length === 0)
}
{
  const b = banco({ numeros: [DRA] })
  const r = await enviarAviso(b, pedido, async () => { throw new Error('rede fora') })
  confere('rede fora: nao lanca e registra', r.length === 1 && !r[0].ok && b.db.conversation_notes.some((n) => n.texto.includes('NÃO chegou')))
}
{
  let chamou = false
  const r = await enviarAviso(banco({ numeros: [] }), pedido, async () => { chamou = true })
  confere('sem numero: aviso desligado, nao chama a Meta', r.length === 0 && !chamou)
  const b = semColuna(banco())
  const reservas = []
  const r2 = await enviarAviso(b, { ...pedido, reserva: async (t) => reservas.push(t) }, async () => { chamou = true })
  confere('banco sem a coluna: nao chama a Meta nem derruba', r2.length === 0 && !chamou)
  confere('banco sem a coluna: grita na nota e na reserva', (b.db.conversation_notes[0]?.texto ?? '').includes('a atualização do banco ainda não chegou') && reservas.length === 1, JSON.stringify(b.db.conversation_notes))
}
{
  // Sem a tabela dos avisos: sai pelo simples, sem botoes (nao ha id para eles).
  const b = banco({ semTabela: ['alertas_de_urgencia'] })
  const m = meta()
  const r = await enviarAviso(b, pedido, m.buscar)
  confere('sem a tabela: vai pelo modelo sem botoes', r.every((e) => e.ok) && m.enviados.every((e) => e.corpo.template.name === 'aviso_pedido_consulta_simples'), JSON.stringify(m.enviados.map((e) => e.corpo.template.name)))
}
{
  // O teste da tela: sem conversa, marcado como teste, sem nota.
  const b = banco()
  await enviarAviso(b, { ...pedido, conversaWhatsApp: undefined, quem: 'Teste da Central', numeros: [DRA] }, meta().buscar)
  confere('teste da tela: aviso marcado como teste', b.db.alertas_de_urgencia[0]?.teste === true)
  confere('teste da tela: sem nota nem evento', !b.db.conversation_notes.length && !b.db.whatsapp_bot_events.length)
  confere('teste da tela: descreve como teste', descreverEnvio([{ numero: DRA, ok: true }], { teste: true }).nota.startsWith('📱 Aviso de teste enviado'))
}
{
  // Pedido refeito com a conversa acesa: so sai sem aviso nas ultimas 48 h.
  const recente = { id: 'a-1', clinic_id: 'c1', motivo: 'pedido', conversa_whatsapp: 'conv-1', criado_em: new Date(AGORA.getTime() - 3 * 3600e3).toISOString(), mensagens: [] }
  const m1 = meta()
  const r1 = await enviarAviso(banco({ alertas: [recente] }), { ...pedido, repetido: true }, m1.buscar)
  confere('repetido: com aviso recente, nao repete', r1.length === 0 && m1.enviados.length === 0)
  const velho = { ...recente, criado_em: new Date(AGORA.getTime() - 50 * 3600e3).toISOString() }
  const m2 = meta()
  const r2 = await enviarAviso(banco({ alertas: [velho] }), { ...pedido, repetido: true }, m2.buscar)
  confere('repetido: aviso de mais de 48 h, avisa de novo', r2.length === 2 && m2.enviados.length === 2)
  const m3 = meta()
  const r3 = await enviarAviso(banco({ alertas: [{ ...recente, conversa_whatsapp: 'conv-9' }] }), { ...pedido, repetido: true }, m3.buscar)
  confere('repetido: aviso recente de outra conversa nao segura', r3.length === 2)
  const r5 = await enviarAviso(banco({ alertas: [{ ...recente, resultado: 'falhou 1/1: (#132001) x' }] }), { ...pedido, repetido: true }, meta().buscar)
  confere('repetido: aviso recente que falhou nao segura', r5.length === 2)
  const m4 = meta()
  const r4 = await enviarAviso(banco({ alertas: [recente] }), pedido, m4.buscar)
  confere('novo: avisa mesmo com aviso recente', r4.length === 2)
}
{
  const r = await enviarAviso(banco(), { ...pedido, motivo: 'urgencia' }, meta().buscar)
  confere('urgencia: ainda sem modelo, nada sai', r.length === 0)
}

// Duvida que o robo e a IA nao resolvem (30/10/2026).
{
  const entraD = (antes, agora) => deveAvisarDuvida({ atencaoAntes: antes.atencao, motivoAntes: antes.motivo, atencaoAgora: agora })
  confere('duvida: passou para a equipe avisa', entraD({ atencao: false, motivo: null }, 'atendente') === 'novo')
  confere('duvida: urgencia avisa', entraD({ atencao: false, motivo: null }, 'urgencia') === 'novo')
  confere('duvida: de duvida para urgencia e aviso novo', entraD({ atencao: true, motivo: 'atendente' }, 'urgencia') === 'novo')
  confere('duvida: com a conversa acesa e repetido', entraD({ atencao: true, motivo: 'atendente' }, 'atendente') === 'repetido')
  confere('duvida: pedido, 2a via e anexo nao viram duvida', ['pedido_consulta', 'visita', 'documento', 'anexo', 'farmacia', null, undefined].every((m) => entraD({ atencao: false, motivo: null }, m) === null))

  const nota = '🤖 Resumo da IA para a equipe: Quer saber se pode levar os exames antigos.'
  confere('duvida: tira o rotulo da nota', resumoDaIA(nota) === 'Quer saber se pode levar os exames antigos.', resumoDaIA(nota))
  confere('duvida: nota de outro tipo nao vira resumo', resumoDaIA('🚨 Sinal de risco de vida na mensagem') === null)
  confere('duvida: o resumo da IA vale mais que o texto', resumoDaDuvida({ nota, texto: 'oi' }) === 'Quer saber se pode levar os exames antigos.')
  confere('duvida: sem IA vai o que a pessoa escreveu', resumoDaDuvida({ texto: 'posso tomar com leite?' }) === 'posso tomar com leite?')
  confere('duvida: urgencia aparece primeiro', resumoDaDuvida({ urgente: true, texto: 'ela caiu' }) === 'URGENTE: ela caiu')
  confere('duvida: sem texto nao sai parametro vazio', resumoDaDuvida({ texto: '   ' }).length > 0)

  const duvida = { ...pedido, motivo: 'duvida', quem: 'Maria Teste', resumo: 'Pergunta se pode levar os exames antigos.' }
  const b = banco()
  const m = meta((corpo, n) => ({ corpo: { messages: [{ id: `wamid.${n}` }] } }))
  const r = await enviarAviso(b, duvida, m.buscar)
  const t = m.enviados[0]?.corpo.template
  confere('duvida: chega nos dois celulares, Dra. primeiro', r.length === 2 && r.every((e) => e.ok) && m.enviados[0].corpo.to === DRA && m.enviados[1].corpo.to === EQUIPE, JSON.stringify(r))
  confere('duvida: modelo proprio e sem botoes', t?.name === MODELO_DA_DUVIDA && t.components.length === 1, JSON.stringify(t))
  confere('duvida: registrada como duvida', b.db.alertas_de_urgencia[0]?.motivo === 'duvida')
  const notaDoEnvio = b.db.conversation_notes[0]?.texto ?? ''
  confere('duvida: a nota nao chama de pedido nem de reserva', notaDoEnvio.startsWith('📱 Aviso da dúvida enviado') && !notaDoEnvio.includes('sem os botões'), notaDoEnvio)
  confere('duvida: evento proprio', b.db.whatsapp_bot_events.some((e) => e.evento === 'aviso_duvida' && e.detalhe === 'enviado 2/2'), JSON.stringify(b.db.whatsapp_bot_events))
  confere('duvida: o modelo tem texto para a tela', Boolean(textoDoModelo(MODELO_DA_DUVIDA, ['Maria', '14:32', 'x'])?.includes('Maria')))

  const semModelo = banco()
  const mS = meta(() => naoAprovado)
  const rS = await enviarAviso(semModelo, duvida, mS.buscar)
  const notaS = semModelo.db.conversation_notes[0]?.texto ?? ''
  confere('duvida: modelo nao aprovado grita', rS.every((e) => !e.ok) && notaS.startsWith('⚠️ O aviso da dúvida NÃO chegou') && notaS.includes(MODELO_DA_DUVIDA), notaS)

  const agora = pedido.agora.getTime()
  const horasAtras = (h) => new Date(agora - h * 3600 * 1000).toISOString()
  const antigo = (h, motivo = 'duvida') => ({ id: 'a1', clinic_id: pedido.clinicId, motivo, conversa_whatsapp: pedido.conversaWhatsApp, resultado: 'enviado 2/2', criado_em: horasAtras(h) })
  const m1 = meta()
  await enviarAviso(banco({ alertas: [antigo(2)] }), { ...duvida, repetido: true }, m1.buscar)
  confere('duvida: mensagens seguidas nao tocam o celular de novo', m1.enviados.length === 0)
  const m2 = meta()
  await enviarAviso(banco({ alertas: [antigo(7)] }), { ...duvida, repetido: true }, m2.buscar)
  confere('duvida: depois de 6 horas sem resposta avisa de novo', m2.enviados.length === 2)
  const m3 = meta()
  await enviarAviso(banco({ alertas: [antigo(2, 'pedido')] }), { ...duvida, repetido: true }, m3.buscar)
  confere('duvida: aviso do pedido nao segura o da duvida', m3.enviados.length === 2)
}

console.log(`aviso do pedido no WhatsApp da Dra.: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}
