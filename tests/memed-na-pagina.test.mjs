// Como reconhecer a Memed na pagina (03/11/2026). Regra em
// src/lib/memed-na-pagina.ts. Neste dia a Memed passou a carregar a
// sinapse-v4, com um iframe so e sem o id antigo, e o botao Prescrever
// desistia em 40 s com ela pronta atras.
import { prescricaoCarregada, memedAberta } from './memed-na-pagina.build.mjs'

let ok = 0
let falhas = 0
function confere(nome, cond, detalhe) {
  if (cond) ok++
  else {
    falhas++
    console.error('FALHOU:', nome, detalhe ?? '')
  }
}

// O que o navegador do consultorio tinha na pagina em 03/11/2026, com a Memed pronta.
const v4 = [{ id: '', src: 'https://v4-embedded.memed.com.br/' }]
confere('Memed nova (v4): pronta pelo iframe de v4-embedded', prescricaoCarregada(v4) === true)
confere('Memed antiga: pronta pelo id do modulo', prescricaoCarregada([{ id: 'mdhub-module-plataforma.prescricao', src: 'https://partners.memed.com.br/x' }]) === true)
confere('outro modulo antigo ainda nao e a prescricao', prescricaoCarregada([{ id: 'mdhub-module-plataforma.sdk', src: '' }]) === false)
confere('iframe de outro site nao conta', prescricaoCarregada([{ id: '', src: 'https://www.youtube.com/embed/x' }, { id: '', src: '' }]) === false)
confere('pagina sem iframe: ainda carregando', prescricaoCarregada([]) === false)
confere('dominio parecido nao conta', prescricaoCarregada([{ id: '', src: 'https://v4-embedded.memed.com.br.outro.com/' }]) === false)
confere('caminho dentro da v4 conta', prescricaoCarregada([{ id: '', src: 'https://v4-embedded.memed.com.br/app?x=1' }]) === true)

// Aberta na frente: a trava de rolagem so pode sair quando nada da Memed esta na tela.
confere('v4 aberta (visible)', memedAberta([], 'visible') === true)
confere('v4 fechada (hidden)', memedAberta([], 'hidden') === false)
confere('sem a div da v4 e sem iframe antigo', memedAberta([], null) === false)
confere('antiga aberta', memedAberta(['none', 'block'], null) === true)
confere('antiga toda fechada', memedAberta(['none', 'none'], null) === false)

console.log(`memed na pagina: ${ok} verificacoes ok, ${falhas} falha(s)`)
if (falhas) process.exit(1)
