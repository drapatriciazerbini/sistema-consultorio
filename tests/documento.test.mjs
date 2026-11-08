// Documento fora da janela de 24 horas (28/10/2026): receita, 2a via, atestado.
//
// O que nao pode quebrar: a Meta recusa a mensagem inteira com parametro vazio
// ou com quebra de linha, o arquivo tem de ir no cabecalho (sem ele o paciente
// recebe "segue em anexo" sem anexo nenhum), e a frase tem de ler bem com cada
// tipo de documento.
import {
  conteudoDoDocumento,
  limparParametro,
  MODELO_DO_DOCUMENTO,
  nomeDoArquivo,
  parametrosDoDocumento,
  TIPOS_DE_ARQUIVO,
  TIPOS_DE_DOCUMENTO,
  tipoDeDocumento,
} from './documento.build.mjs'
import { textoDoModelo } from './modelos.build.mjs'

let passou = 0
const falhas = []
function conferir(titulo, condicao, detalhe = '') {
  if (condicao) passou++
  else falhas.push(`${titulo}${detalhe ? ` | ${detalhe}` : ''}`)
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// --- parametros -------------------------------------------------------------
let p = parametrosDoDocumento('Ana', 'segunda_via', 'Maria')
conferir('Ordem do modelo: quem le, documento, paciente', igual(p, ['Ana', 'a 2ª via da receita', 'Maria']), JSON.stringify(p))

p = parametrosDoDocumento('', 'atestado', 'Maria')
conferir('Sem nome de quem le: "tudo bem", nunca vazio', p[0] === 'tudo bem', p[0])

p = parametrosDoDocumento('Ana\nPaula', 'receita', 'Maria\t\tSouza   Lima')
conferir('Quebra de linha e tabulacao viram espaco', igual(p, ['Ana Paula', 'a receita', 'Maria Souza Lima']), JSON.stringify(p))
conferir('Nenhum parametro com quebra de linha', p.every((x) => !/[\r\n\t]/.test(x)))
conferir('Nenhum parametro com 4 espacos seguidos', p.every((x) => !/ {4}/.test(x)))

conferir('limparParametro corta no limite', limparParametro('x'.repeat(200), 60).length === 60)
conferir('limparParametro de nulo e vazio', limparParametro(null) === '')

// --- tipos ------------------------------------------------------------------
conferir('Tipo conhecido passa', tipoDeDocumento('segunda_via') === 'segunda_via')
conferir('Tipo inventado nao passa', tipoDeDocumento('laudo_falso') === null)
conferir('Tipo herdado do objeto nao passa', tipoDeDocumento('toString') === null)
for (const [id, t] of Object.entries(TIPOS_DE_DOCUMENTO)) {
  conferir(`Frase de ${id} traz o artigo`, /^(a|o) /.test(t.frase), t.frase)
  conferir(`Nome de arquivo de ${id} sem acento`, !/[^\x20-\x7e]/.test(t.arquivo), t.arquivo)
}
conferir('PDF aceito', TIPOS_DE_ARQUIVO.includes('application/pdf'))
conferir('Foto nao vai no cabecalho Documento', !TIPOS_DE_ARQUIVO.includes('image/jpeg'))

// --- nome do arquivo --------------------------------------------------------
conferir('Nome do arquivo para o paciente', nomeDoArquivo('segunda_via', 'Maria', 'rx_8f3a1c.PDF') === 'Receita 2a via - Maria.pdf', nomeDoArquivo('segunda_via', 'Maria', 'rx_8f3a1c.PDF'))
conferir('Acento e barra saem do nome', nomeDoArquivo('atestado', 'João/Antônio', 'a.pdf') === 'Atestado - JoaoAntonio.pdf', nomeDoArquivo('atestado', 'João/Antônio', 'a.pdf'))
conferir('Sem extensao vira .pdf', nomeDoArquivo('receita', 'Ana', 'receita') === 'Receita - Ana.pdf', nomeDoArquivo('receita', 'Ana', 'receita'))
conferir('Word mantem .docx', nomeDoArquivo('relatorio', 'Ana', 'r.docx').endsWith('.docx'))

// --- mensagem para a Meta ---------------------------------------------------
const params = parametrosDoDocumento('Ana', 'receita', 'Maria')
const c = conteudoDoDocumento({ modelo: MODELO_DO_DOCUMENTO, idioma: '', mediaId: '123', arquivo: 'Receita - Maria.pdf', parametros: params })
conferir('Vai como modelo', c.type === 'template' && c.template.name === 'documento_do_consultorio')
conferir('Idioma vazio vira pt_BR', c.template.language.code === 'pt_BR')
const cab = c.template.components.find((x) => x.type === 'header')
conferir('Arquivo no cabecalho, pelo id da Meta', cab?.parameters?.[0]?.type === 'document' && cab.parameters[0].document.id === '123', JSON.stringify(cab))
conferir('Nome do arquivo no cabecalho', cab?.parameters?.[0]?.document?.filename === 'Receita - Maria.pdf')
const corpo = c.template.components.find((x) => x.type === 'body')
conferir('Tres parametros no corpo, em ordem', igual(corpo?.parameters?.map((x) => x.text), ['Ana', 'a receita', 'Maria']), JSON.stringify(corpo))

// --- o que fica na conversa -------------------------------------------------
const texto = textoDoModelo(MODELO_DO_DOCUMENTO, parametrosDoDocumento('Ana', 'segunda_via', 'Maria')) ?? ''
conferir('A conversa guarda a frase que a paciente leu',
  texto === 'Olá, Ana. Aqui é o consultório da Dra. Patrícia Zerbini. Segue em anexo a 2ª via da receita de Maria. Se tiver alguma dúvida, é só responder por aqui.',
  texto)

console.log(`VERIFICAÇÕES QUE PASSARAM: ${passou}`)
console.log(`FALHAS: ${falhas.length}`)
if (falhas.length) {
  console.log('')
  for (const f of falhas) console.log(`✗ ${f}`)
  process.exit(1)
}
