/**
 * Documento do consultorio para o paciente com a janela de 24 horas ja fechada
 * (07/11/2026, portado do sistema do Dr. Marcello, onde nasceu em 28/10).
 *
 * Pedido do Edu: a Dra. Patricia precisa mandar receita, 2a via, atestado e
 * outros documentos sem depender do paciente ou da familia escrever antes. Ate
 * aqui o arquivo so saia com a janela aberta (whatsapp-reply); fechada, a tela
 * oferecia texto ou convite, e o PDF esperava a filha responder "oi" para
 * poder ir - em geral o pedido de 2a via chega de noite e a receita refeita
 * fica pronta no dia seguinte, com a janela ja fechada.
 *
 * Fora da janela a Meta so aceita modelo aprovado. Este leva o arquivo no
 * cabecalho (tipo Documento) e uma frase fixa em volta:
 *
 *   [documento]
 *   Ola, {{1}}. Aqui e o consultorio da Dra. Patricia Zerbini. Segue em anexo
 *   {{2}} de {{3}}. Se tiver alguma duvida, e so responder por aqui.
 *
 * (texto exato, com acentos, em modelos.ts; o modelo precisa estar aprovado na
 * conta da Dra., ver MODELOS-META.md). {{1}} e quem le (responsavel ou nome do
 * perfil), {{2}} o documento ("a 2a via da receita"), {{3}} o paciente.
 * Categoria Utilidade: e entrega de algo que o paciente pediu ou que faz parte
 * do atendimento, nunca divulgacao.
 *
 * Aqui so o que nao depende de rede, para os testes (tests/documento.test.mjs).
 */

export const MODELO_DO_DOCUMENTO = 'documento_do_consultorio'

/**
 * O que a tela oferece. `frase` entra no {{2}} e ja traz o artigo, porque "Segue
 * em anexo receita de Maria" soa como formulario; `arquivo` vira o nome que o
 * paciente ve no celular ("Receita - Maria.pdf"), no lugar de "rx_8f3a1c.pdf".
 */
export const TIPOS_DE_DOCUMENTO = {
  receita: { rotulo: 'Receita', frase: 'a receita', arquivo: 'Receita' },
  segunda_via: { rotulo: '2ª via de receita', frase: 'a 2ª via da receita', arquivo: 'Receita 2a via' },
  atestado: { rotulo: 'Atestado', frase: 'o atestado', arquivo: 'Atestado' },
  declaracao: { rotulo: 'Declaração de comparecimento', frase: 'a declaração de comparecimento', arquivo: 'Declaracao de comparecimento' },
  pedido_exame: { rotulo: 'Pedido de exame', frase: 'o pedido de exame', arquivo: 'Pedido de exame' },
  relatorio: { rotulo: 'Relatório médico', frase: 'o relatório médico', arquivo: 'Relatorio medico' },
  recibo: { rotulo: 'Recibo', frase: 'o recibo', arquivo: 'Recibo' },
  outro: { rotulo: 'Outro documento', frase: 'o documento', arquivo: 'Documento' },
} as const

export type TipoDeDocumento = keyof typeof TIPOS_DE_DOCUMENTO

export function tipoDeDocumento(valor: unknown): TipoDeDocumento | null {
  const v = String(valor ?? '')
  return Object.prototype.hasOwnProperty.call(TIPOS_DE_DOCUMENTO, v) ? (v as TipoDeDocumento) : null
}

/**
 * Cabecalho Documento da Meta: PDF e Office. Foto nao entra - modelo com foto e
 * outro tipo de cabecalho, e atestado fotografado na mesa chega torto e ilegivel
 * na farmacia; a Memed ja entrega PDF.
 */
export const TIPOS_DE_ARQUIVO = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
/** O acervo da clinica aceita 20 MB (a Meta aceitaria 100). */
export const LIMITE_DO_ARQUIVO = 20 * 1048576

/**
 * Parametro de modelo nao aceita quebra de linha, tabulacao nem 4 espacos
 * seguidos: a Meta recusa a mensagem inteira com erro generico (o mesmo
 * cuidado de whatsapp-reopen). Vazio tambem e recusado.
 */
export function limparParametro(texto: unknown, limite = 60): string {
  return String(texto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, limite).trim()
}

/** "Receita 2a via - Maria.pdf": sem acento nem barra, que alguns celulares estropiam. */
export function nomeDoArquivo(tipo: TipoDeDocumento, paciente: string, original: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(original.trim())?.[1]?.toLowerCase() ?? 'pdf'
  const nome = limparParametro(paciente, 40)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, '').replace(/ {2,}/g, ' ').trim()
  return `${TIPOS_DE_DOCUMENTO[tipo].arquivo}${nome ? ` - ${nome}` : ''}.${ext}`
}

/** Os tres parametros do corpo, na ordem do modelo. */
export function parametrosDoDocumento(para: string, tipo: TipoDeDocumento, paciente: string): string[] {
  // Sem nome de quem le, "Olá, tudo bem." ainda e frase (o mesmo do convite).
  return [limparParametro(para, 40) || 'tudo bem', TIPOS_DE_DOCUMENTO[tipo].frase, limparParametro(paciente, 60)]
}

/**
 * A mensagem como a Meta quer: o arquivo (ja subido, pelo id) no cabecalho e
 * os tres parametros no corpo.
 */
export function conteudoDoDocumento(p: {
  modelo: string
  idioma: string
  mediaId: string
  arquivo: string
  parametros: string[]
}): Record<string, unknown> {
  return {
    type: 'template',
    template: {
      name: p.modelo,
      language: { code: p.idioma || 'pt_BR' },
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: p.mediaId, filename: p.arquivo } }] },
        { type: 'body', parameters: p.parametros.map((text) => ({ type: 'text', text })) },
      ],
    },
  }
}
