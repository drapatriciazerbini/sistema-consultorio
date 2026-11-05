// Gravar audio na tela de Respostas (05/11/2026). Regras em
// src/lib/gravacao-de-audio.ts e supabase/functions/_shared/arquivo-da-resposta.ts.
// O ponto que decide se funciona e o formato: o padrao do gravador do Chrome e
// WebM, que a Meta recusa.
import { formatoDeGravacao, nomeDaGravacao, tempoDeGravacao, LIMITE_DA_GRAVACAO_S } from './gravacao-de-audio.build.mjs'
import { classificarArquivo, nomeDoTipo } from './arquivo-da-resposta.build.mjs'

let ok = 0
let falhas = 0
function confere(nome, cond, detalhe) {
  if (cond) ok++
  else {
    falhas++
    console.error('FALHOU:', nome, detalhe ?? '')
  }
}

// O que o Chrome do consultorio respondeu em 05/11/2026.
const chromeDoConsultorio = (tipo) => ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4;codecs=opus', 'audio/webm;codecs=opus'].includes(tipo)
const firefox = (tipo) => ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'].includes(tipo)
const soWebm = (tipo) => tipo === 'audio/webm;codecs=opus'

const noChrome = formatoDeGravacao(chromeDoConsultorio)
confere('Chrome: grava AAC em MP4, que a Meta aceita', noChrome?.gravador === 'audio/mp4;codecs=mp4a.40.2' && noChrome.mime === 'audio/mp4' && noChrome.extensao === 'm4a', JSON.stringify(noChrome))
confere('Firefox: grava OGG com Opus', formatoDeGravacao(firefox)?.mime === 'audio/ogg')
confere('so WebM: nao grava (a Meta recusaria)', formatoDeGravacao(soWebm) === null)
confere('navegador que lanca na pergunta: nao grava', formatoDeGravacao(() => { throw new Error('x') }) === null)
confere('o arquivo gravado e aceito pelo servidor', classificarArquivo(noChrome.mime)?.tipo === 'audio' && classificarArquivo(formatoDeGravacao(firefox).mime)?.tipo === 'audio')

confere('tempo: 0:07 e 1:23', tempoDeGravacao(7) === '0:07' && tempoDeGravacao(83) === '1:23' && tempoDeGravacao(-3) === '0:00')
confere('teto de 10 minutos', LIMITE_DA_GRAVACAO_S === 600)
confere('nome com a hora de Brasilia', nomeDaGravacao(new Date('2026-11-05T17:05:00Z'), noChrome) === 'audio-14h05.m4a', nomeDaGravacao(new Date('2026-11-05T17:05:00Z'), noChrome))

// O servidor (whatsapp-reply): o que entra e como a Meta recebe.
confere('servidor: audio do Chrome e do Firefox', classificarArquivo('audio/mp4')?.tipo === 'audio' && classificarArquivo('audio/ogg; codecs=opus')?.tipo === 'audio')
confere('servidor: audio ate 16 MB', classificarArquivo('audio/mp4')?.limite === 16 * 1048576)
confere('servidor: WebM recusado', classificarArquivo('audio/webm') === null && classificarArquivo('audio/webm;codecs=opus') === null)
confere('servidor: o que ja passava continua', classificarArquivo('application/pdf')?.tipo === 'document' && classificarArquivo('image/png')?.tipo === 'image' && classificarArquivo('image/gif') === null)
confere('servidor: nome do tipo no erro', nomeDoTipo('audio') === 'áudio' && nomeDoTipo('image') === 'imagem' && nomeDoTipo('document') === 'documento')

console.log(`gravacao de audio: ${ok} verificacoes ok, ${falhas} falha(s)`)
if (falhas) process.exit(1)
