// Heranca das consultas anteriores e prazo do retorno. As curvas da OMS do
// sistema de origem sao de pediatria e nao vieram para este sistema.
// Dados inventados.
import {
  herancaDasAnteriores,
  aplicarHeranca,
  desfazerHeranca,
  temConteudo,
} from './continuidade-da-consulta.build.mjs'
import { prazoDoRetorno, somarDias, janelaDoRetorno, agruparPorDia } from './retorno.build.mjs'

let ok = 0
let falhas = 0
function confere(nome, cond, detalhe) {
  if (cond) ok++
  else {
    falhas++
    console.error('FALHOU:', nome, detalhe ?? '')
  }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const HOJE = '2026-09-25'
const vazio = { alergias: '', antecedentesPessoais: '', antecedentesFamiliares: '', medicamentos: '' }
const c = (id, data, campos = {}) => ({ id, data, criadoEm: `${data}T10:00:00Z`, ...vazio, ...campos })

// ---------------------------------------------------------------- heranca
{
  const lista = [
    c('a', '2026-03-01', { antecedentesPessoais: 'Prematuro 34s', alergias: 'Amoxicilina' }),
    c('b', '2026-06-01', { medicamentos: 'Omeprazol 10 mg' }),
    c('c', '2026-09-01', { medicamentos: 'Omeprazol 20 mg', alergias: '<p><br></p>' }),
    c('futura', '2026-12-01', { alergias: 'Dipirona' }),
  ]
  const h = herancaDasAnteriores(lista, null, HOJE)
  const mapa = Object.fromEntries(h.map((x) => [x.campo, x]))
  confere('alergia vem da consulta que a tem, mesmo antiga', mapa.alergias?.valor === 'Amoxicilina' && mapa.alergias.data === '2026-03-01')
  confere('HTML vazio nao conta como alergia', mapa.alergias?.valor !== '<p><br></p>')
  confere('medicamentos vem da mais recente', mapa.medicamentos?.valor === 'Omeprazol 20 mg')
  confere('antecedentes da primeira consulta continuam', mapa.antecedentesPessoais?.valor === 'Prematuro 34s')
  confere('campo que nunca foi escrito nao aparece', !mapa.antecedentesFamiliares)
  confere('consulta futura nao e historico', h.every((x) => x.valor !== 'Dipirona'))
  confere('a propria consulta nao herda de si', herancaDasAnteriores([c('x', '2026-09-01', { alergias: 'Ovo' })], 'x', HOJE).length === 0)

  const form = { ...vazio, medicamentos: 'Escrito hoje', queixa: 'dor' }
  const { formulario, aplicada } = aplicarHeranca(form, h)
  confere('nao sobrescreve o que foi escrito hoje', formulario.medicamentos === 'Escrito hoje')
  confere('preenche o campo vazio', formulario.alergias === 'Amoxicilina')
  confere('aplicada lista so o que entrou', !aplicada.some((x) => x.campo === 'medicamentos'))
  confere('campos de fora da heranca ficam', formulario.queixa === 'dor')

  const editado = { ...formulario, antecedentesPessoais: 'Prematuro 34s, UTI 10 dias' }
  const desfeito = desfazerHeranca(editado, aplicada)
  confere('desfazer limpa o herdado intacto', desfeito.alergias === '')
  confere('desfazer preserva o que o medico editou', desfeito.antecedentesPessoais === 'Prematuro 34s, UTI 10 dias')
  confere('temConteudo com nbsp e vazio', !temConteudo('&nbsp; <br>') && temConteudo('<p>x</p>'))
}

// ---------------------------------------------------------------- retorno
const prazos = [
  ['Retorno em 30 dias', 30],
  ['retorno 1 mês', 30],
  ['Retornar em 3 meses com exames', 90],
  ['<p>Retorno em <b>6 semanas</b></p>', 42],
  ['retorno em tres meses', 90],
  ['Retorno 1 ano', 365],
  ['15d', 15],
  ['2m', 60],
  ['Retorno se piorar', null],
  ['', null],
  ['Retorno em 40 anos', null],
]
for (const [texto, esperado] of prazos) {
  confere(`prazo de "${texto}"`, prazoDoRetorno(texto) === esperado, String(prazoDoRetorno(texto)))
}
confere('somar dias atravessa o mes', somarDias('2026-09-25', 30) === '2026-10-25')
confere('somar dias atravessa o ano', somarDias('2026-12-20', 15) === '2027-01-04')
confere('janela comeca 3 dias antes', igual(janelaDoRetorno('2026-10-25', HOJE), { de: '2026-10-22', ate: '2026-11-04' }))
confere('janela nunca comeca no passado', janelaDoRetorno('2026-09-26', HOJE).de === HOJE)
{
  const grupos = agruparPorDia(['2026-10-23T12:00:00Z', '2026-10-22T13:00:00Z', '2026-10-22T02:30:00Z'])
  // 02:30 UTC de 22/10 e 23:30 de 21/10 em Sao Paulo.
  confere('agrupa pelo dia de Sao Paulo', igual(grupos.map((g) => g.dia), ['2026-10-21', '2026-10-22', '2026-10-23']), JSON.stringify(grupos))
}

console.log(`Prontuário (herança, retorno): ${ok} verificações passaram.`)
if (falhas) {
  console.error(`FALHAS: ${falhas}`)
  process.exit(1)
}
