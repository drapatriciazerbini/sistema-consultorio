// Audio do paciente vira texto para o robo e a IA (porte de 18/11/2026 do
// sistema do Dr. Marcello, de 09/11/2026). Regras em
// supabase/functions/_shared/audio-como-texto.ts e transcricao.ts. A Groq e de
// mentira: nenhuma chamada sai daqui. Falas e chave inventadas.
import assert from 'node:assert/strict'
import { audioPedeGente, avisoDoAudioSemTexto, corpoDoAudio, ehAudio, lerAudio, modoDoAudio, textoDaTranscricao } from './audio-como-texto.build.mjs'
import { transcreverAudio, transcreverAudioComMotivo } from './transcricao.build.mjs'
import { interpretarResposta } from './lembrete.build.mjs'

let ok = 0
async function caso(nome, fn) {
  try {
    await fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

// Os avisos do proprio modulo (sem chave, recusa) sao esperados aqui: ficam
// fora da saida para nao parecerem defeito.
const avisar = console.warn
console.warn = () => {}

await caso('a fala da filha vira o texto que o robo le, sem espacos sobrando', () => {
  assert.equal(textoDaTranscricao('  Oi, eu queria marcar uma consulta\n pra minha mãe. '), 'Oi, eu queria marcar uma consulta pra minha mãe.')
})

await caso('sem transcricao, o audio continua anexo', () => {
  assert.equal(textoDaTranscricao(null), null)
  assert.equal(textoDaTranscricao(''), null)
  assert.equal(textoDaTranscricao(' . '), null)
})

await caso('frase inventada pelo Whisper em audio mudo nao vira mensagem', () => {
  assert.equal(textoDaTranscricao('Legendas pela comunidade Amara.org'), null)
  assert.equal(textoDaTranscricao('Obrigado por assistir!'), null)
  assert.equal(textoDaTranscricao('Obrigado.'), null)
})

await caso('obrigada no meio de uma fala de verdade continua valendo', () => {
  assert.equal(textoDaTranscricao('Obrigada, doutora. Ele melhorou da tontura.'), 'Obrigada, doutora. Ele melhorou da tontura.')
})

await caso('no historico da Central o texto vai com o microfone na frente', () => {
  assert.equal(corpoDoAudio('quero marcar uma visita em casa'), '🎤 quero marcar uma visita em casa')
})

await caso('audio e voice sao audio; foto e texto nao', () => {
  assert.equal(ehAudio('audio') && ehAudio('voice'), true)
  assert.equal(ehAudio('image') || ehAudio('text') || ehAudio(undefined), false)
})

// --- A transcricao, com a Groq de mentira ---
const BYTES = new Uint8Array([1, 2, 3])

await caso('sem a chave no servidor: nada sai para a Groq, e o motivo e sem_chave', async () => {
  let chamou = false
  const r = await transcreverAudioComMotivo(BYTES, 'audio/ogg', { chave: '', buscar: async () => ((chamou = true), new Response('{}')) })
  assert.deepEqual(r, { texto: null, motivo: 'sem_chave' })
  assert.equal(chamou, false)
  assert.equal(await transcreverAudio(BYTES, 'audio/ogg', { chave: '' }), null)
})

await caso('com a chave: manda o audio em portugues e devolve o texto', async () => {
  const chamadas = []
  const buscar = async (url, init) => {
    chamadas.push({ url, init })
    return new Response(JSON.stringify({ text: ' Quero marcar uma consulta. ' }))
  }
  const r = await transcreverAudioComMotivo(BYTES, 'audio/ogg; codecs=opus', { chave: 'chave-de-teste', buscar })
  assert.deepEqual(r, { texto: 'Quero marcar uma consulta.', motivo: null })
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer chave-de-teste')
  assert.equal(chamadas[0].init.body.get('language'), 'pt')
  assert.equal(chamadas[0].init.body.get('file').type, 'audio/ogg')
})

await caso('a Groq recusou: motivo e o codigo, sem lancar', async () => {
  const r = await transcreverAudioComMotivo(BYTES, 'audio/ogg', { chave: 'chave-de-teste', buscar: async () => new Response('invalid api key', { status: 401 }) })
  assert.deepEqual(r, { texto: null, motivo: 'recusou', detalhe: 'HTTP 401' })
})

await caso('rede caiu: motivo falhou, sem lancar', async () => {
  const r = await transcreverAudioComMotivo(BYTES, 'audio/ogg', { chave: 'chave-de-teste', buscar: async () => { throw new Error('rede') } })
  assert.deepEqual(r, { texto: null, motivo: 'falhou' })
})

await caso('audio vazio ou sem fala: tamanho e vazio', async () => {
  assert.equal((await transcreverAudioComMotivo(new Uint8Array(), 'audio/ogg', { chave: 'chave-de-teste' })).motivo, 'tamanho')
  const mudo = await transcreverAudioComMotivo(BYTES, 'audio/ogg', { chave: 'chave-de-teste', buscar: async () => new Response(JSON.stringify({ text: '  ' })) })
  assert.deepEqual(mudo, { texto: null, motivo: 'vazio' })
})

// --- A linha vermelha da Central ---
await caso('sem a chave, a tela diz que a transcricao nao esta configurada', () => {
  const aviso = avisoDoAudioSemTexto('sem_chave')
  assert.match(aviso, /Transcrição não configurada/)
  assert.match(aviso, /GROQ_API_KEY/)
})

await caso('recusa e falha tambem aparecem; audio mudo nao e defeito', () => {
  assert.match(avisoDoAudioSemTexto('recusou', 'HTTP 401'), /recusou este áudio \(HTTP 401\)/)
  assert.match(avisoDoAudioSemTexto('falhou'), /falhou ou demorou/)
  assert.match(avisoDoAudioSemTexto('tamanho'), /grande demais/)
  assert.equal(avisoDoAudioSemTexto('vazio'), null)
  assert.equal(avisoDoAudioSemTexto(null), null)
})

// --- O que o webhook faz com o audio ---
// A leitura de verdade do lembrete, com o lembrete como ultima mensagem nossa.
const depoisDoLembrete = (texto) => interpretarResposta(texto, true, true)

await caso('a transcricao nasce desligada: sem o segredo, nenhum audio sai do sistema', () => {
  assert.equal(modoDoAudio(undefined), 'desligado')
  assert.equal(modoDoAudio(''), 'desligado')
  // Erro de digitacao no segredo nao manda audio para fora nem liga o robo.
  assert.equal(modoDoAudio('rob'), 'desligado')
  assert.equal(modoDoAudio('ligado'), 'desligado')
  assert.equal(modoDoAudio(' Central '), 'central')
  assert.equal(modoDoAudio(' Robo '), 'robo')
  assert.equal(modoDoAudio('robô'), 'robo')
  assert.equal(modoDoAudio('desligado'), 'desligado')
  assert.equal(modoDoAudio('OFF'), 'desligado')
})

await caso('so na Central: o texto aparece no balao e o robo segue tratando como anexo', () => {
  assert.deepEqual(lerAudio({ texto: 'Oi, queria saber o valor da consulta', motivo: null }, depoisDoLembrete, false), {
    paraORobo: null,
    corpo: '🎤 Oi, queria saber o valor da consulta',
    aviso: null,
  })
  // Nem o "confirmo" nem o "cancelar" falados agem: o robo nao le nada.
  assert.equal(lerAudio({ texto: 'Sim, confirmo a consulta.', motivo: null }, depoisDoLembrete, false).paraORobo, null)
  assert.equal(lerAudio({ texto: 'quero cancelar a consulta', motivo: null }, depoisDoLembrete, false).aviso, null)
  // Sem a chave, a linha vermelha aparece do mesmo jeito.
  assert.match(lerAudio({ texto: null, motivo: 'sem_chave' }, depoisDoLembrete, false).aviso, /Transcrição não configurada/)
})

await caso('audio comum, com o robo lendo: o robo le o texto, a Central mostra com 🎤, sem aviso', () => {
  assert.deepEqual(lerAudio({ texto: 'Oi, queria saber o valor da consulta', motivo: null }, depoisDoLembrete, true), {
    paraORobo: 'Oi, queria saber o valor da consulta',
    corpo: '🎤 Oi, queria saber o valor da consulta',
    aviso: null,
  })
})

await caso('confirmar por audio vale: nao tira a vaga de ninguem', () => {
  const r = lerAudio({ texto: 'Sim, confirmo a consulta.', motivo: null }, depoisDoLembrete, true)
  assert.equal(r.paraORobo, 'Sim, confirmo a consulta.')
  assert.equal(r.aviso, null)
})

await caso('audio que fala em cancelar nao age sozinho: vai para a equipe, com o texto no balao e o aviso', () => {
  const fala = 'Olha, eu tive de cancelar o passeio pra poder ir na consulta'
  // A leitura por palavra entenderia cancelamento: e isso que o audio nao pode disparar.
  assert.equal(depoisDoLembrete(fala).cancela, true)
  assert.equal(audioPedeGente(depoisDoLembrete(fala)), true)
  const r = lerAudio({ texto: fala, motivo: null }, depoisDoLembrete, true)
  assert.equal(r.paraORobo, null)
  assert.equal(r.corpo, `🎤 ${fala}`)
  assert.match(r.aviso, /o robô não fez nada sozinho/)
})

await caso('audio pedindo para nao receber mensagens tambem nao descadastra sozinho', () => {
  const r = lerAudio({ texto: 'Eu não quero mais receber mensagem de vocês', motivo: null }, depoisDoLembrete, true)
  assert.equal(r.paraORobo, null)
  assert.match(r.aviso, /não receber mensagens/)
  assert.equal(audioPedeGente(null), false)
  assert.equal(audioPedeGente({ cancela: false, optedOut: false }), false)
})

await caso('sem texto: segue anexo, e o motivo vira aviso', () => {
  assert.deepEqual(lerAudio({ texto: null, motivo: 'sem_chave' }, depoisDoLembrete, true), {
    paraORobo: null,
    corpo: null,
    aviso: '⚠️ Transcrição não configurada: falta a chave GROQ_API_KEY no servidor. Ouça o áudio.',
  })
  // Fala inventada pelo Whisper: segue anexo, sem aviso (nao e defeito).
  assert.deepEqual(lerAudio({ texto: 'Obrigado por assistir!', motivo: null }, depoisDoLembrete, true), { paraORobo: null, corpo: null, aviso: null })
})

console.warn = avisar
console.log(`audio como texto: ${ok} verificacoes ok`)
