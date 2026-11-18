// O que entra no acervo dos anexos e o que se diz quando nao entra
// (supabase/functions/_shared/acervo-do-anexo.ts). Porte de 18/11/2026: no
// sistema do Dr. Marcello, um PDF de 29,4 MB apareceu na Central so com o nome,
// sem abrir, porque o acervo aceitava 20 MB e a recusa nao aparecia na tela.
// Nomes de arquivo inventados.
import assert from 'node:assert/strict'
import {
  avisoDoArquivoPerdido,
  emMegas,
  grandeDemais,
  LIMITE_DO_ACERVO,
  TIPOS_DO_ACERVO,
  tipoParaOAcervo,
} from './acervo-do-anexo.build.mjs'
import { readFileSync, readdirSync } from 'node:fs'

let ok = 0
function caso(nome, fn) {
  try {
    fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

caso('PDF com o tipo certo entra como PDF', () => {
  assert.equal(tipoParaOAcervo('application/pdf', 'tomografia-paciente-teste.pdf'), 'application/pdf')
})

caso('PDF com rotulo generico entra como PDF pela extensao', () => {
  assert.equal(tipoParaOAcervo('application/octet-stream', 'tomografia-paciente-teste.pdf'), 'application/pdf')
  assert.equal(tipoParaOAcervo(undefined, 'exame.PDF'), 'application/pdf')
})

caso('audio do WhatsApp com parametro entra sem o parametro', () => {
  assert.equal(tipoParaOAcervo('audio/ogg; codecs=opus', null), 'audio/ogg')
  assert.equal(tipoParaOAcervo('IMAGE/JPEG', null), 'image/jpeg')
})

caso('tipo fora da lista e sem extensao conhecida nao entra', () => {
  assert.equal(tipoParaOAcervo('application/zip', 'exames.zip'), null)
  assert.equal(tipoParaOAcervo('application/octet-stream', null), null)
})

caso('o tipo da Meta vale mais que a extensao quando esta na lista', () => {
  assert.equal(tipoParaOAcervo('image/png', 'foto.jpg'), 'image/png')
})

caso('tamanho: o PDF de 29,4 MB cabe; acima do limite nao sobe; sem tamanho deixa tentar', () => {
  assert.equal(grandeDemais(29.4 * 1024 * 1024), false)
  assert.equal(LIMITE_DO_ACERVO, 50 * 1024 * 1024)
  assert.equal(grandeDemais(LIMITE_DO_ACERVO), false)
  assert.equal(grandeDemais(LIMITE_DO_ACERVO + 1), true)
  assert.equal(grandeDemais(undefined), false)
  assert.equal(grandeDemais(null), false)
  assert.equal(emMegas(24.5 * 1024 * 1024), '24,5 MB')
})

caso('a falha aparece escrita na mensagem, sem falar em crianca nem em mae', () => {
  const aviso = avisoDoArquivoPerdido('arquivo de 61,0 MB, acima do limite de 50,0 MB')
  assert.match(aviso, /não chegou à Central \(arquivo de 61,0 MB/)
  assert.match(aviso, /paciente ou o familiar/)
  assert.doesNotMatch(aviso, /família|mãe|criança/i)
})

// O numero do codigo e o do banco precisam ser o mesmo: com o codigo em 50 MB
// e a pasta em 20 MB, o arquivo de 30 MB passaria pela conta e seria recusado
// pelo acervo, que e exatamente o defeito de origem.
caso('o limite do codigo e o mesmo da ultima migration que mexe na pasta', () => {
  const pasta = new URL('../supabase/migrations/', import.meta.url)
  const limites = readdirSync(pasta)
    .sort()
    .map((nome) => readFileSync(new URL(nome, pasta), 'utf8'))
    .filter((sql) => /whatsapp-anexos/.test(sql))
    .map((sql) => /set file_size_limit = (\d+)/.exec(sql)?.[1] ?? /'whatsapp-anexos',\s*false,\s*(\d+)/.exec(sql)?.[1])
    .filter(Boolean)
  assert.ok(limites.length >= 2, 'a criacao da pasta e o aumento do limite')
  assert.equal(Number(limites.at(-1)), LIMITE_DO_ACERVO)
})

caso('a lista de tipos do codigo e a da migration que criou a pasta', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260924000800_ver_anexos_do_whatsapp.sql', import.meta.url), 'utf8')
  const bloco = sql.slice(sql.indexOf("'whatsapp-anexos'"), sql.indexOf('on conflict'))
  const doBanco = [...bloco.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/g)].map((m) => m[1])
  assert.deepEqual([...doBanco].sort(), [...TIPOS_DO_ACERVO].sort())
})

console.log(`acervo do anexo: ${ok} verificacoes ok`)
