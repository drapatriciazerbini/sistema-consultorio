/**
 * O que entra no acervo whatsapp-anexos, e o que dizer quando nao entra
 * (porte de 18/11/2026, do sistema do Dr. Marcello, la desde 09/11/2026).
 *
 * O caso de la: um raio-x em PDF apareceu na Central so com o nome do arquivo,
 * sem o botao de abrir. O arquivo nao tinha chegado ao acervo, e o webhook so
 * dizia isso no log: a tela mostrava o nome como se estivesse tudo certo, e o
 * robo ainda respondeu "Recebi o que voce enviou". O arquivo tinha 29,4 MB e o
 * acervo aceitava 20 MB.
 *
 * Aqui e o mesmo risco, com outro tipo de arquivo: laudo de tomografia ou de
 * ressonancia em PDF, que a filha ou o cuidador manda antes da consulta. No
 * codigo, o arquivo so deixava de entrar por tipo, por tamanho ou por erro de
 * rede com a Meta, e nenhum dos tres aparecia na tela. Entao:
 *  - o tipo: o acervo so aceita a lista fechada da migration 20260924000800, e
 *    PDF pode chegar com rotulo generico ("application/octet-stream") quando
 *    sai de app de laboratorio ou do gerenciador de arquivos; o acervo
 *    recusaria um PDF por causa do rotulo. Fora da lista, vale a extensao do
 *    nome. "audio/ogg; codecs=opus" vira "audio/ogg".
 *  - o tamanho: acima do limite do acervo nem tenta subir, e diz quanto tinha.
 *  - a falha grita: vai para failure_reason da mensagem, que a tela ja mostra
 *    em vermelho embaixo do balao. A proxima vez diz qual foi.
 *
 * Sem import: o teste roda direto no Node (tests/acervo-do-anexo.test.mjs).
 */

/**
 * O limite do acervo: file_size_limit da pasta whatsapp-anexos, 50 MB desde a
 * migration 20261118030000 (era 20 MB). Mudou la, muda aqui.
 */
export const LIMITE_DO_ACERVO = 50 * 1024 * 1024

/** A mesma lista de allowed_mime_types do acervo. Mudou la, muda aqui. */
export const TIPOS_DO_ACERVO = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
  'video/mp4', 'video/3gpp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
] as const

const POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  amr: 'audio/amr',
}

/**
 * O tipo com que o arquivo vai para o acervo, ou null se o acervo nao aceita.
 * Primeiro o que a Meta disse (sem os parametros); se nao estiver na lista,
 * a extensao do nome do arquivo.
 */
export function tipoParaOAcervo(mimeDaMeta: string | null | undefined, nome?: string | null): string | null {
  const base = String(mimeDaMeta ?? '').split(';')[0].trim().toLowerCase()
  if ((TIPOS_DO_ACERVO as readonly string[]).includes(base)) return base
  const extensao = /\.([a-z0-9]{2,5})$/i.exec(String(nome ?? '').trim())?.[1]?.toLowerCase()
  return (extensao && POR_EXTENSAO[extensao]) || null
}

/** Tamanho legivel, em MB com uma casa ("23,4 MB"). */
export function emMegas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** O arquivo passa do limite do acervo? Sem tamanho informado, deixa tentar. */
export function grandeDemais(bytes: number | null | undefined): boolean {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > LIMITE_DO_ACERVO
}

/** A linha vermelha embaixo da mensagem, na Central. */
export function avisoDoArquivoPerdido(motivo: string): string {
  return `⚠️ O arquivo não chegou à Central (${motivo}). Peça para o paciente ou o familiar mandar de novo; se for PDF grande, uma foto ou print da tela também serve.`
}
