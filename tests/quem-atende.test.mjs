// Quem atende nas frases fixas do robo.
import { quemAtende } from './quem-atende.build.mjs'

let ok = 0
let falhas = 0
function confere(nome, cond, detalhe) {
  if (cond) ok++
  else {
    falhas++
    console.error('FALHOU:', nome, detalhe ?? '')
  }
}

// Toda frase fixa fala da Dra. Patricia, com qualquer clinica ou sem clinica.
for (const clinica of ['c1', null, 'qualquer']) {
  const q = quemAtende(clinica)
  confere(`${clinica}: a Dra. Patrícia`, q.o === 'a Dra. Patrícia' && q.O === 'A Dra. Patrícia')
  confere(`${clinica}: saudacao`, q.saudacaoPadrao === 'Olá! 👋 Aqui é o consultório da Dra. Patrícia Zerbini.')
  confere(`${clinica}: nenhuma frase com Marcello`, !/Marcello/.test(JSON.stringify(q)), JSON.stringify(q))
}

console.log(`Quem atende: ${ok} verificações passaram.`)
if (falhas) {
  console.error(`FALHAS: ${falhas}`)
  process.exit(1)
}
