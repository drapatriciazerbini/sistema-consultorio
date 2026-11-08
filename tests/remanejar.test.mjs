// Remanejar consulta pela Agenda (28/10/2026): muda a propria consulta, sem
// cancelar e sem avisar ninguem. Dados inventados: o repositorio e publico.
import {
  camposDoRemanejamento,
  duracaoEmMinutos,
  impedimentoDoEncaixe,
  impedimentoDoRemanejamento,
  instanteEmSaoPaulo,
} from './remanejar.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

// 28/10/2026, 14:48 em Sao Paulo.
const AGORA = new Date('2026-10-28T17:48:00Z')

// O caso que trouxe isto: consulta de sexta 06/11 as 10:00, para hoje as 17h20.
const consulta = {
  id: 'c1',
  startsAt: '2026-11-06T13:00:00Z',
  endsAt: '2026-11-06T13:40:00Z',
  rescheduleCount: 0,
}
const agenda = [
  consulta,
  // Hoje das 16:40 as 17:20, logo antes do horario pedido.
  { id: 'c2', startsAt: '2026-10-28T19:40:00Z', endsAt: '2026-10-28T20:20:00Z', status: 'scheduled', patientName: 'Paciente B' },
  { id: 'c3', startsAt: '2026-10-28T21:00:00Z', endsAt: '2026-10-28T21:40:00Z', status: 'cancelled', patientName: 'Paciente C' },
  { id: 'r1', startsAt: '2026-10-29T12:00:00Z', endsAt: '2026-10-29T12:40:00Z', status: 'scheduled', patientName: '' },
]
consulta.status = 'scheduled'
consulta.patientName = 'Paciente A'

// ---- horario digitado no encaixe
confere('17:20 de Sao Paulo e 20:20 UTC', instanteEmSaoPaulo('2026-10-28', '17:20') === '2026-10-28T20:20:00.000Z',
  instanteEmSaoPaulo('2026-10-28', '17:20'))
confere('meia-noite nao vira o dia anterior', instanteEmSaoPaulo('2026-11-06', '00:00') === '2026-11-06T03:00:00.000Z')
confere('dia vazio: nada', instanteEmSaoPaulo('', '17:20') === null)
confere('hora vazia: nada', instanteEmSaoPaulo('2026-10-28', '') === null)
confere('hora sem dois digitos: nada', instanteEmSaoPaulo('2026-10-28', '7:20') === null)
confere('data impossivel: nada', instanteEmSaoPaulo('2026-13-45', '10:00') === null)

// ---- duracao
confere('consulta de 40 minutos continua com 40', duracaoEmMinutos(consulta, 30) === 40)
confere('fim antes do inicio: duracao padrao',
  duracaoEmMinutos({ startsAt: '2026-11-06T13:00:00Z', endsAt: '2026-11-06T12:00:00Z' }, 40) === 40)
confere('fim invalido: duracao padrao', duracaoEmMinutos({ startsAt: '2026-11-06T13:00:00Z', endsAt: '' }, 40) === 40)

// ---- quando pode e quando nao pode
const as1720 = instanteEmSaoPaulo('2026-10-28', '17:20')
confere('real 28/10: 06/11 10:00 para hoje 17:20 pode',
  impedimentoDoRemanejamento(consulta, as1720, 40, agenda, AGORA) === null,
  impedimentoDoRemanejamento(consulta, as1720, 40, agenda, AGORA))
confere('sem horario escolhido: pede para escolher',
  impedimentoDoRemanejamento(consulta, null, 40, agenda, AGORA) === 'Escolha o novo horário.')
confere('o mesmo horario de agora nao e remanejar',
  /já está nesse horário/.test(impedimentoDoRemanejamento(consulta, '2026-11-06T13:00:00.000Z', 40, agenda, AGORA) ?? ''))
confere('horario que ja passou: recusa',
  /já passou/.test(impedimentoDoRemanejamento(consulta, instanteEmSaoPaulo('2026-10-28', '14:00'), 40, agenda, AGORA) ?? ''))

// Encaixe as 17:00 cai dentro da consulta das 16:40. O banco so recusaria se
// comecasse no mesmo minuto.
const choque = impedimentoDoRemanejamento(consulta, instanteEmSaoPaulo('2026-10-28', '17:00'), 40, agenda, AGORA)
confere('encaixe por cima de outra consulta: recusa, com nome e hora', /Paciente B às 16:40/.test(choque ?? ''), choque)
// Comeca num horario vazio, mas os 40 minutos invadem a das 16:40.
const invade = impedimentoDoRemanejamento(consulta, instanteEmSaoPaulo('2026-10-28', '16:20'), 40, agenda, AGORA)
confere('encaixe que termina dentro da proxima consulta: recusa', /Paciente B às 16:40/.test(invade ?? ''), invade)
confere('terminar quando a outra comeca nao e choque',
  impedimentoDoRemanejamento(consulta, instanteEmSaoPaulo('2026-10-28', '16:00'), 40, agenda, AGORA) === null)
confere('comecar quando a outra termina nao e choque (o 17:20 depois das 16:40)',
  impedimentoDoRemanejamento(consulta, as1720, 40, agenda, AGORA) === null)
confere('consulta cancelada nao ocupa o horario',
  impedimentoDoRemanejamento(consulta, instanteEmSaoPaulo('2026-10-28', '18:00'), 40, agenda, AGORA) === null)
const reserva = impedimentoDoRemanejamento(consulta, instanteEmSaoPaulo('2026-10-29', '09:20'), 40, agenda, AGORA)
confere('reserva sem paciente tambem ocupa, e aparece como reserva', /uma reserva às 09:00/.test(reserva ?? ''), reserva)

// Mover 20 minutos dentro do proprio horario: a consulta nao choca com ela mesma.
confere('a propria consulta nao conta como choque',
  impedimentoDoRemanejamento(consulta, '2026-11-06T13:20:00.000Z', 40, agenda, AGORA) === null)

// ---- o que vai para o banco
const campos = camposDoRemanejamento({ rescheduleCount: 0 }, as1720, 40)
confere('comeca no horario novo', campos.starts_at === '2026-10-28T20:20:00.000Z', campos.starts_at)
confere('termina 40 minutos depois', campos.ends_at === '2026-10-28T21:00:00.000Z', campos.ends_at)
confere('lembrete do horario antigo zerado (senao o do dia novo nao sai)',
  campos.reminder_sent_at === null && campos.reminder_failed_at === null && campos.reminder_failure_reason === null)
confere('confirmacao do horario antigo zerada', campos.confirmed_at === null)
confere('pedido de remarcar atendido', campos.reschedule_requested_at === null)
confere('conta como remarcacao', campos.reschedule_count === 1)
confere('contagem soma a anterior', camposDoRemanejamento({ rescheduleCount: 2 }, as1720, 40).reschedule_count === 3)
confere('contagem ausente comeca de 1', camposDoRemanejamento({}, as1720, 40).reschedule_count === 1)
// Nada de status, paciente, ficha ou convenio: remanejar nao pode cancelar
// nem apagar o que o paciente ja respondeu.
const esperadas = ['confirmed_at', 'ends_at', 'reminder_failed_at', 'reminder_failure_reason', 'reminder_sent_at',
  'reschedule_count', 'reschedule_requested_at', 'starts_at']
confere('so mexe no horario, no lembrete e na contagem',
  JSON.stringify(Object.keys(campos).sort()) === JSON.stringify(esperadas), Object.keys(campos).sort().join(','))

// ---- encaixe so no fim do dia e com o OK da Dra. (regra de 29/10/2026, do sistema do Dr. Marcello)
// Grade de hoje: livres 16:00 e 17:20 (Sao Paulo), a Paciente B das 16:40 as 17:20.
const livresHoje = ['2026-10-28T19:00:00.000Z', '2026-10-28T20:20:00.000Z']
const as1730 = instanteEmSaoPaulo('2026-10-28', '17:30')
const as1800 = instanteEmSaoPaulo('2026-10-28', '18:00')
const semOk = impedimentoDoEncaixe(consulta, as1800, '2026-10-28', 40, livresHoje, agenda, false)
confere('encaixe sem autorizacao: recusa', /autoriza/.test(semOk ?? ''), semOk)
const noMeio = impedimentoDoEncaixe(consulta, as1730, '2026-10-28', 40, livresHoje, agenda, true)
confere('encaixe antes do fim do ultimo horario: recusa, dizendo a partir de quando', /a partir de 18:00/.test(noMeio ?? ''), noMeio)
confere('encaixe depois do ultimo horario, autorizado: pode',
  impedimentoDoEncaixe(consulta, as1800, '2026-10-28', 40, livresHoje, agenda, true) === null)
// O ultimo horario pode ser uma consulta marcada, e nao um horario livre.
const marcadaNoFim = [...agenda, { id: 'c9', startsAt: '2026-10-28T21:00:00Z', endsAt: '2026-10-28T21:40:00Z', status: 'scheduled', patientName: 'Paciente D' }]
const depoisDaMarcada = impedimentoDoEncaixe(consulta, as1800, '2026-10-28', 40, livresHoje, marcadaNoFim, true)
confere('consulta marcada no fim conta como ultimo horario', /a partir de 18:40/.test(depoisDaMarcada ?? ''), depoisDaMarcada)
// Cancelada nao conta, e a propria consulta tambem nao.
confere('consulta cancelada nao empurra o fim do dia',
  impedimentoDoEncaixe(consulta, as1800, '2026-10-28', 40, livresHoje, [...agenda, { id: 'c8', startsAt: '2026-10-28T21:00:00Z', endsAt: '2026-10-28T21:40:00Z', status: 'cancelled' }], true) === null)
const diaSemAgenda = impedimentoDoEncaixe(consulta, instanteEmSaoPaulo('2026-11-01', '18:00'), '2026-11-01', 40, [], agenda, true)
confere('dia sem agenda: recusa', /não tem agenda/.test(diaSemAgenda ?? ''), diaSemAgenda)

console.log(`remanejar: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}
