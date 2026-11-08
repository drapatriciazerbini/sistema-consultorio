// Gasto do Google Ads pelo script da conta (supabase/functions/_shared/gastos-google.ts).
// Pedido do Edu em 05/11/2026: "conseguimos conectar do Google tambem?". O
// script que o Edu cola no Google Ads e gerado aqui; este teste roda o script
// de verdade contra um Google Ads de mentira, para provar que ele manda o que a
// funcao aceita - ninguem consegue rodar o script do lado do Google num teste.
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
  DESDE_GOOGLE,
  erroDoScript,
  hashDaChave,
  novaChave,
  scriptDoGoogleAds,
  validarRelatorio,
} from './gastos-google.build.mjs'

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

const BOM = { conta: '123-456-7890', moeda: 'BRL', desde: '2026-10-01', ate: '2026-11-05', dias: { '2026-11-03': 24.137, '2026-11-04': 0 }, campanhas: {} }

await caso('relatorio bom: arredonda em centavos e deixa o dia zerado de fora', () => {
  const r = validarRelatorio(BOM)
  assert.equal(r.ok, true)
  assert.deepEqual(r.relatorio.dias, { '2026-11-03': 24.14 })
  assert.equal(r.relatorio.conta, '123-456-7890')
  assert.equal(r.relatorio.desde, '2026-10-01')
})

await caso('relatorio estranho e recusado, nao consertado', () => {
  assert.equal(validarRelatorio(null).ok, false)
  assert.equal(validarRelatorio([]).ok, false)
  // outra moeda somaria dolar com real
  assert.match(validarRelatorio({ ...BOM, moeda: 'USD' }).erro, /USD/)
  assert.equal(validarRelatorio({ ...BOM, desde: undefined }).ok, false)
  assert.equal(validarRelatorio({ ...BOM, desde: '2026-11-06' }).ok, false, 'desde depois de ate')
  assert.equal(validarRelatorio({ ...BOM, dias: { '03/11/2026': 10 } }).ok, false)
  assert.equal(validarRelatorio({ ...BOM, dias: { '2026-02-30': 10 } }).ok, false, 'o Date aceita 30/02 e vira 02/03')
  assert.equal(validarRelatorio({ ...BOM, dias: { '2026-11-03': -5 } }).ok, false)
  assert.equal(validarRelatorio({ ...BOM, dias: { '2026-11-03': 'muito' } }).ok, false)
  assert.equal(validarRelatorio({ ...BOM, dias: [1, 2] }).ok, false)
})

await caso('campanhas: sem gasto ficam de fora, nome vazio ganha nome', () => {
  const r = validarRelatorio({
    ...BOM,
    campanhas: { 111: { nome: 'Santos', dias: { '2026-11-03': 15 } }, 222: { nome: '', dias: { '2026-11-03': 9.14 } }, 333: { nome: 'Pausada', dias: { '2026-11-03': 0 } } },
  })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.relatorio.campanhas).sort(), ['111', '222'])
  assert.equal(r.relatorio.campanhas['222'].nome, 'Campanha sem nome')
  assert.equal(validarRelatorio({ ...BOM, campanhas: { 1: { dias: { x: 1 } } } }).ok, false)
})

await caso('erro avisado pelo proprio script', () => {
  assert.equal(erroDoScript({ erro: '  Quota excedida ' }), 'Quota excedida')
  assert.equal(erroDoScript(BOM), null)
  assert.equal(erroDoScript(null), null)
})

await caso('chave: aleatoria, base64url, e o banco so ve o sha-256', async () => {
  const a = novaChave()
  const b = novaChave()
  assert.notEqual(a, b)
  assert.match(a, /^[A-Za-z0-9_-]{43}$/)
  const h = await hashDaChave(a)
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.equal(await hashDaChave(` ${a} `), h, 'espaco colado junto nao muda a chave')
  assert.notEqual(await hashDaChave(b), h)
  // sha-256 de "abc", para o hash nao ser so "algum hex"
  assert.equal(await hashDaChave('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

// ---------- o script, rodando contra um Google Ads de mentira ----------
function googleDeMentira({ linhas = [], resposta = [200, '{"ok":true}'], buscaFalha = null } = {}) {
  const enviados = []
  const logs = []
  const ctx = {
    AdsApp: {
      currentAccount: () => ({ getTimeZone: () => 'America/Sao_Paulo', getCustomerId: () => '123-456-7890', getCurrencyCode: () => 'BRL' }),
      search: (q) => {
        enviados.push({ busca: q })
        if (buscaFalha) throw new Error(buscaFalha)
        let i = 0
        return { hasNext: () => i < linhas.length, next: () => linhas[i++] }
      },
    },
    Utilities: { formatDate: () => '2026-11-05' },
    UrlFetchApp: {
      fetch: (url, opcoes) => {
        enviados.push({ url, opcoes })
        return { getResponseCode: () => resposta[0], getContentText: () => resposta[1] }
      },
    },
    Logger: { log: (m) => logs.push(m) },
  }
  return { ctx, enviados, logs }
}
const linha = (dia, id, nome, micros) => ({ segments: { date: dia }, campaign: { id, name: nome }, metrics: { costMicros: String(micros) } })
const URL_DA_FUNCAO = 'https://nvsxgvtwmcivdmrtpdqx.supabase.co/functions/v1/gastos-google'

function rodar(script, ctx) {
  vm.createContext(ctx)
  vm.runInContext(script, ctx)
  return vm.runInContext('main()', ctx)
}

await caso('script: soma por dia e por campanha e manda com a chave no header', () => {
  const chave = novaChave()
  const script = scriptDoGoogleAds({ url: URL_DA_FUNCAO, chave })
  const g = googleDeMentira({
    linhas: [
      linha('2026-11-03', 111, 'Santos', 15_000_000),
      linha('2026-11-03', 222, 'São Paulo', 9_140_000),
      linha('2026-11-04', 111, 'Santos', 14_990_000),
      linha('2026-11-04', 222, 'São Paulo', 0),
    ],
  })
  rodar(script, g.ctx)
  const busca = g.enviados.find((e) => e.busca).busca
  assert.match(busca, new RegExp(`BETWEEN '${DESDE_GOOGLE}' AND '2026-11-05'`))
  const envio = g.enviados.find((e) => e.url)
  assert.equal(envio.url, URL_DA_FUNCAO)
  assert.equal(envio.opcoes.method, 'post')
  assert.equal(envio.opcoes.headers['x-chave-google'], chave)
  const corpo = JSON.parse(envio.opcoes.payload)
  assert.deepEqual(corpo.dias, { '2026-11-03': 24.14, '2026-11-04': 14.99 })
  assert.equal(corpo.campanhas['111'].nome, 'Santos')
  assert.equal(corpo.campanhas['222'].dias['2026-11-04'], undefined, 'dia sem custo nao vai')
  // o que o script manda passa na conferencia da funcao
  const v = validarRelatorio(corpo)
  assert.equal(v.ok, true, v.erro)
  assert.equal(v.relatorio.conta, '123-456-7890')
  assert.equal(g.logs.length, 1)
})

await caso('script: Central recusou -> o script falha (o Google manda e-mail ao dono)', () => {
  const g = googleDeMentira({ linhas: [linha('2026-11-03', 1, 'X', 1_000_000)], resposta: [401, 'Chave desconhecida'] })
  assert.throws(() => rodar(scriptDoGoogleAds({ url: URL_DA_FUNCAO, chave: 'velha' }), g.ctx), /recusou o gasto \(401\): Chave desconhecida/)
})

await caso('script: a busca no Google falhou -> avisa a Central e falha tambem', () => {
  const g = googleDeMentira({ buscaFalha: 'AuthorizationError' })
  assert.throws(() => rodar(scriptDoGoogleAds({ url: URL_DA_FUNCAO, chave: 'k' }), g.ctx), /AuthorizationError/)
  const envio = g.enviados.find((e) => e.url)
  assert.ok(envio, 'o erro tem de chegar na Central para aparecer na tela')
  assert.match(erroDoScript(JSON.parse(envio.opcoes.payload)), /AuthorizationError/)
})

await caso('script: a chave e a URL vao como texto JS seguro', () => {
  const s = scriptDoGoogleAds({ url: URL_DA_FUNCAO, chave: `a"b'c\\d` })
  const g = googleDeMentira()
  rodar(s, g.ctx)
  assert.equal(g.enviados.find((e) => e.url).opcoes.headers['x-chave-google'], `a"b'c\\d`)
})

console.log(`gastos-google: ${ok} verificacoes ok`)
