/**
 * O nome do arquivo do paciente no celular da Dra. (porte de 20/11/2026 do
 * sistema do Dr. Marcello, onde entrou em 13/11).
 *
 * Pedido do Edu, olhando o WhatsApp do Dr. Marcello: o PDF chegava como
 * "9adbbdb1-187c-43d3-b424-957b38854988.pdf". "Se for exame, mesmo que tenha um
 * monte de nome, coloque exame 1, exame 2... audio 1, audio 2 da familia tal."
 * Aqui o arquivo do paciente chega ao celular da Dra. pelo repasse da resposta
 * (resposta-ao-alerta.ts), com o mesmo problema.
 *
 * O rotulo sai do tipo do arquivo e do que o paciente ESCREVEU junto (legenda,
 * mensagem). O arquivo em si nao e lido: e palpite por palavra, e por isso so
 * troca o nome quando a pista e clara. Sem pista, fica "Foto", "Documento",
 * "Audio" - nunca um rotulo inventado.
 */

const semAcento = (t: string) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// A ficha vem antes da receita de proposito: "a farmacia pediu que o medico
// preencha essa ficha, apos o envio da receita" (caso real no sistema do Dr.
// Marcello, 11/11/2026) fala das duas, e o arquivo era a ficha. Os exames
// incluem os comuns do idoso (densitometria, eletro, eco, holter).
const PISTAS: [string, RegExp][] = [
  ['Ficha', /\b(fichas?|formularios?|relatorios?|declaracao|declaracoes|atestados?)\b/],
  [
    'Exame',
    /\b(exames?|raio ?-?x|rx|ultrass?om|ultrassonografia|usg|hemograma|laudos?|resultados?|endoscopia|colonoscopia|tomografia|ressonancia|biopsia|densitometria|eletrocardiograma|ecg|ecocardiograma|holter|mamografia)\b/,
  ],
  ['Receita', /\b(receitas?|prescricao|prescricoes)\b/],
]

/** A familia do tipo: audio e voz sao a mesma coisa para quem recebe. */
export function familiaDoTipo(tipo: string | null | undefined): 'audio' | 'video' | 'image' | 'document' | null {
  if (tipo === 'audio' || tipo === 'voice') return 'audio'
  if (tipo === 'video' || tipo === 'image' || tipo === 'document') return tipo
  return null
}

/** "Exame", "Foto", "Audio"... pelo tipo e pelo que o paciente escreveu junto. */
export function classeDoAnexo(tipo: string | null | undefined, contexto: string | null | undefined): string {
  const familia = familiaDoTipo(tipo)
  if (familia === 'audio') return 'Áudio'
  if (familia === 'video') return 'Vídeo'
  const texto = semAcento(contexto ?? '')
  for (const [classe, pista] of PISTAS) if (pista.test(texto)) return classe
  return familia === 'image' ? 'Foto' : 'Documento'
}

/** "Exame 2". Sem ordem conhecida, so "Exame". */
export function rotuloDoAnexo(tipo: string | null | undefined, contexto: string | null | undefined, ordem?: number | null): string {
  const classe = classeDoAnexo(tipo, contexto)
  return ordem && ordem > 0 ? `${classe} ${ordem}` : classe
}

const limpo = (t: string) => String(t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()

/**
 * O nome do documento no celular: "Exame - Maria Aparecida Souza.pdf". A
 * extensao e a do arquivo original; sem ela, o WhatsApp nao abre o PDF.
 */
export function nomeDoArquivo(rotulo: string, quem: string | null | undefined, nomeOriginal: string | null | undefined): string {
  const extensao = /\.([a-z0-9]{2,5})$/i.exec(String(nomeOriginal ?? '').trim())?.[1]?.toLowerCase()
  // Barra, dois-pontos e afins quebram o nome do arquivo no celular.
  const dono = limpo(quem ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 60).trim()
  const base = dono ? `${rotulo} - ${dono}` : rotulo
  return extensao ? `${base}.${extensao}` : base
}
