// Quem desliga o "Carregando dados da clinica" (11/11/2026): restaurar a
// Marina deixou a tela presa ate o F5. Ver src/lib/vez-da-recarga.ts.
import { criarVezDaRecarga } from './vez-da-recarga.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

function tela() {
  const estado = { carregando: false }
  const recargas = criarVezDaRecarga((v) => { estado.carregando = v })
  return { estado, recargas }
}

{
  // O caso da Marina: restaurar recarrega com a tela de carregando; um segundo
  // depois o tempo real pede a silenciosa; a primeira termina antes.
  const { estado, recargas } = tela()
  const restaurar = recargas.comecar(false)
  confere('restaurar liga o carregando', estado.carregando === true)
  const tempoReal = recargas.comecar(true)
  confere('a do restaurar deixa de ser a ultima', !restaurar.ehAUltima())
  confere('a do tempo real e a ultima', tempoReal.ehAUltima())
  restaurar.terminar()
  confere('a antiga termina: o resultado dela nao vale, a tela segue carregando', estado.carregando === true)
  tempoReal.terminar()
  confere('a silenciosa, ultima, termina e desliga o carregando', estado.carregando === false)
}

{
  // A ordem ao contrario: a silenciosa (ultima) termina antes da antiga.
  const { estado, recargas } = tela()
  const restaurar = recargas.comecar(false)
  const tempoReal = recargas.comecar(true)
  tempoReal.terminar()
  confere('a ultima termina primeiro e desliga', estado.carregando === false)
  restaurar.terminar()
  confere('a antiga terminando depois nao religa nada', estado.carregando === false)
}

{
  const { estado, recargas } = tela()
  const v = recargas.comecar(true)
  confere('silenciosa sozinha nunca liga o carregando', estado.carregando === false)
  v.terminar()
  confere('e termina sem mexer', estado.carregando === false)
}

{
  const { estado, recargas } = tela()
  const a = recargas.comecar(false)
  const b = recargas.comecar(false)
  a.terminar()
  confere('duas com carregando: a antiga terminando nao desliga', estado.carregando === true)
  b.terminar()
  confere('a nova terminando desliga', estado.carregando === false)
}

{
  const { estado, recargas } = tela()
  const a = recargas.comecar(false)
  const b = recargas.comecar(true)
  const c = recargas.comecar(false)
  b.terminar()
  confere('a silenciosa do meio nao desliga a que veio depois dela', estado.carregando === true)
  a.terminar()
  c.terminar()
  confere('a ultima desliga', estado.carregando === false)
}

{
  const { recargas } = tela()
  const a = recargas.comecar(false)
  recargas.descartarTodas()
  confere('tela que saiu: a recarga em andamento nao grava mais', !a.ehAUltima())
}

if (falhas.length) {
  console.error(`vez-da-recarga: ${falhas.length} falha(s)\n- ${falhas.join('\n- ')}`)
  process.exit(1)
}
console.log(`vez-da-recarga: ${ok} verificacoes ok`)
