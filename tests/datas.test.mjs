// Data de nascimento digitada pela familia na ficha do WhatsApp.
//
// Em 22/09/2026 uma mae escreveu "25/07/23" e o cadastro saiu sem data de
// nascimento, porque so ano com quatro digitos era aceito. Sem essa data a
// Memed recusa a receita.
//
// PARA PROVAR QUE ESTE TESTE PEGA O DEFEITO: troque `(\d{2}|\d{4})` por
// `(\d{4})` em _shared/datas.ts, ou volte a regra pediatrica do ano curto
// (sempre 2000 + ano). Os casos de dois digitos caem.
import { dataDeNascimentoIso } from './datas.build.mjs'

let passou = 0
const falhas = []
const conferir = (titulo, condicao, detalhe = '') => {
  if (condicao) passou++
  else falhas.push(`${titulo}${detalhe ? ` | ${detalhe}` : ''}`)
}
const HOJE = new Date('2026-09-22T12:00:00Z')
const ler = (t) => dataDeNascimentoIso(t, HOJE)

// Ano com dois digitos na geriatria (27/10/2026): a regra que veio da
// pediatria lia "45" como 2045 (futuro, sem data) e "23" como 2023 (um bebe no
// prontuario de uma senhora).
conferir('"12/03/45" e 1945', ler('12/03/45') === '1945-03-12', `veio ${ler('12/03/45')}`)
conferir('"25/07/23" e 1923, senhora de 103 anos', ler('25/07/23') === '1923-07-25', `veio ${ler('25/07/23')}`)
conferir('"05" e 2005: adulto de 21 anos, nao 121', ler('01/01/05') === '2005-01-01', `veio ${ler('01/01/05')}`)
conferir('"30" e 1930', ler('01/01/30') === '1930-01-01')
conferir('Quatro digitos continuam valendo', ler('22/06/1940') === '1940-06-22')
conferir('Dia e mes de um digito', ler('5/3/1950') === '1950-03-05')
conferir('Separador com ponto', ler('05.03.1950') === '1950-03-05')
conferir('Separador com traco', ler('05-03-50') === '1950-03-05')

// O que NAO pode virar data no prontuario.
conferir('"20" fica sem data: 106 anos ou 6 anos', ler('01/01/20') === null)
conferir('31/02 nao existe', ler('31/02/2020') === null)
conferir('29/02 em ano bissexto existe', ler('29/02/2020') === '2020-02-29')
conferir('29/02 em ano comum nao existe', ler('29/02/2021') === null)
conferir('Mes 13 nao existe', ler('01/13/2020') === null)
conferir('Nascimento no futuro e erro de digitacao', ler('01/12/2026') === null)
conferir('Texto livre fica sem data', ler('março de 2019') === null)
conferir('Vazio fica sem data', ler('') === null)

console.log(`Datas: ${passou} verificações passaram.`)
if (falhas.length) {
  console.log(`FALHAS: ${falhas.length}`)
  for (const f of falhas) console.log(`✗ ${f}`)
  process.exit(1)
}
