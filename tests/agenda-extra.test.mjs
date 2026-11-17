// Horario extra numa data so e ferias (17/11/2026, ver src/lib/agenda-extra.ts).
// A tela separa o extra do bloqueio: um horario aberto na lista de "Datas
// bloqueadas" seria apagado por quem quisesse liberar um dia.
import { separarExcecoes, problemaDoPeriodo, feriasEmVigor } from './agenda-extra.build.mjs'

let falhas = 0
let ok = 0
function confere(nome, cond) {
  if (cond) ok++
  else {
    falhas++
    console.error('FALHOU:', nome)
  }
}

const base = { reason: '' }
const excecoes = [
  { ...base, id: 'b1', unitId: null, date: '2026-12-25', isClosed: true, startsAt: null, endsAt: null },
  { ...base, id: 'e2', unitId: 'u-cons', date: '2026-12-14', isClosed: false, startsAt: '10:30:00', endsAt: '11:10:00' },
  { ...base, id: 'e1', unitId: 'u-cons', date: '2026-12-14', isClosed: false, startsAt: '09:00:00', endsAt: '09:40:00' },
  { ...base, id: 'e3', unitId: 'u-casa', date: '2026-12-18', isClosed: false, startsAt: '14:30:00', endsAt: '15:10:00' },
  // Extra sem hora nao e extra: nao ha o que mostrar nem oferecer.
  { ...base, id: 'x', unitId: 'u-cons', date: '2026-12-15', isClosed: false, startsAt: null, endsAt: null },
]

{
  const { bloqueios, extras } = separarExcecoes(excecoes, 'u-cons')
  confere('bloqueio fica so com o dia fechado', bloqueios.length === 1 && bloqueios[0].id === 'b1')
  confere('extras da unidade, em ordem de hora', extras.map((e) => e.id).join(',') === 'e1,e2')
}
{
  const { extras } = separarExcecoes(excecoes, 'u-casa')
  confere('extra da visita so aparece na visita', extras.map((e) => e.id).join(',') === 'e3')
}

const hoje = '2026-11-17'
confere('extra sem data', problemaDoPeriodo({ repete: false, data: '', inicio: '09:00', fim: '09:40' }, hoje) === 'Escolha a data do horário extra.')
confere('fim antes do inicio', problemaDoPeriodo({ repete: false, data: '2026-12-14', inicio: '10:00', fim: '09:40' }, hoje) === 'O fim do período precisa ser depois do início.')
confere('data que ja passou', problemaDoPeriodo({ repete: false, data: '2026-11-16', inicio: '09:00', fim: '09:40' }, hoje) === 'Essa data já passou.')
confere('extra valido', problemaDoPeriodo({ repete: false, data: '2026-12-14', inicio: '09:00', fim: '09:40' }, hoje) === null)
confere('semanal nao pede data', problemaDoPeriodo({ repete: true, data: '', inicio: '08:00', fim: '12:00' }, hoje) === null)

confere('ferias futuras valem', feriasEmVigor('2026-12-14', hoje) === true)
confere('no dia da volta ja nao e ferias', feriasEmVigor('2026-11-17', hoje) === false)
confere('sem data nao e ferias', feriasEmVigor('', hoje) === false && feriasEmVigor(null, hoje) === false)

console.log(`agenda-extra: ${ok} verificações passaram, ${falhas} falharam`)
if (falhas) process.exit(1)
