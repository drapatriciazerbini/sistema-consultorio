// Quem pode assinar o que chega ao meta-webhook (porte de 19/11/2026). Ver
// supabase/functions/_shared/assinatura-do-webhook.ts. Segredos inventados.
// Para provar que um caso pega o defeito, ver DESLIGAR em montar-para-teste.mjs.
import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conferirDesligar, lerComTrocas, montar } from './montar-para-teste.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const A = await montar(
  join(AQUI, '..', 'supabase', 'functions', '_shared', 'assinatura-do-webhook.ts'),
  join(AQUI, 'assinatura-do-webhook.build.mjs'),
)

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

// As mesmas contas de sha256HmacHex e safeEqual (whatsapp.ts), pelo Node.
const hmac = async (segredo, corpo) => createHmac('sha256', segredo).update(corpo).digest('hex')
const igual = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const assinar = (segredo, corpo) => `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`
const ambiente = (valores) => (nome) => valores[nome]

const CORPO = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '100000000000001', changes: [] }] })
const ATUAL = 'segredo-do-app-de-hoje'
const ECM = 'segredo-do-app-da-ecm'
const INSTAGRAM = 'segredo-do-app-do-instagram'

await caso('sem META_APP_SECRET_ECM a lista e a de hoje: app atual e Instagram', async () => {
  assert.deepEqual(A.segredosDoWebhook(ambiente({ META_APP_SECRET: ATUAL, INSTAGRAM_APP_SECRET: INSTAGRAM })), [ATUAL, INSTAGRAM])
  assert.deepEqual(A.segredosDoWebhook(ambiente({ META_APP_SECRET: ` ${ATUAL} ` })), [ATUAL])
  // Segredo criado em branco conta como nao criado.
  assert.deepEqual(A.segredosDoWebhook(ambiente({ META_APP_SECRET: ATUAL, META_APP_SECRET_ECM: '   ' })), [ATUAL])
})

await caso('sem META_APP_SECRET_ECM a assinatura so vale pelo app atual', async () => {
  const segredos = A.segredosDoWebhook(ambiente({ META_APP_SECRET: ATUAL }))
  assert.equal(await A.assinaturaConfere(segredos, CORPO, assinar(ATUAL, CORPO), hmac, igual), true)
  assert.equal(
    await A.assinaturaConfere(segredos, CORPO, assinar(ECM, CORPO), hmac, igual),
    false,
    'aviso assinado pelo app da ECM e recusado enquanto o segredo dele nao existe',
  )
  assert.equal(await A.assinaturaConfere(segredos, CORPO, assinar('outro-app-qualquer', CORPO), hmac, igual), false)
})

await caso('com o segredo da ECM valem os dois apps, e o Instagram continua valendo', async () => {
  const segredos = A.segredosDoWebhook(ambiente({ META_APP_SECRET: ATUAL, META_APP_SECRET_ECM: ECM, INSTAGRAM_APP_SECRET: INSTAGRAM }))
  assert.deepEqual(segredos, [ATUAL, ECM, INSTAGRAM])
  for (const segredo of [ATUAL, ECM, INSTAGRAM]) {
    assert.equal(await A.assinaturaConfere(segredos, CORPO, assinar(segredo, CORPO), hmac, igual), true, segredo)
  }
  assert.equal(await A.assinaturaConfere(segredos, CORPO, assinar('outro-app-qualquer', CORPO), hmac, igual), false)
})

await caso('corpo mexido, assinatura sem sha256= e lista vazia sao recusados', async () => {
  const segredos = [ATUAL, ECM]
  assert.equal(await A.assinaturaConfere(segredos, CORPO + ' ', assinar(ATUAL, CORPO), hmac, igual), false)
  assert.equal(await A.assinaturaConfere(segredos, CORPO, assinar(ATUAL, CORPO).replace('sha256=', ''), hmac, igual), false)
  assert.equal(await A.assinaturaConfere(segredos, CORPO, '', hmac, igual), false)
  assert.equal(await A.assinaturaConfere([], CORPO, assinar(ATUAL, CORPO), hmac, igual), false)
  assert.equal(await A.assinaturaConfere([''], CORPO, assinar('', CORPO), hmac, igual), false, 'segredo vazio nao assina nada')
})

await caso('sem app do WhatsApp nenhum o webhook nao aceita nada, nem com o do Instagram', async () => {
  assert.deepEqual(A.segredosDoWebhook(ambiente({})), [])
  assert.deepEqual(A.segredosDoWebhook(ambiente({ INSTAGRAM_APP_SECRET: INSTAGRAM })), [], 'como sempre foi: sem META_APP_SECRET, 401')
  // No dia em que o app de hoje sair de cena, so o da ECM basta.
  assert.deepEqual(A.segredosDoWebhook(ambiente({ META_APP_SECRET_ECM: ECM })), [ECM])
})

await caso('meta-webhook confere a assinatura por aqui, antes de ler o corpo', async () => {
  const fonte = lerComTrocas(join(AQUI, '..', 'supabase', 'functions', 'meta-webhook', 'index.ts'))
  const lista = fonte.indexOf('const segredos = segredosDoWebhook((nome) => Deno.env.get(nome))')
  const recusa = fonte.indexOf("if (!segredos.length || !providedSignature.startsWith('sha256=')) return text('Unauthorized', 401)")
  const confere = fonte.indexOf('if (!(await assinaturaConfere(segredos, rawBody, providedSignature, sha256HmacHex, safeEqual))) {')
  const leitura = fonte.indexOf('const payload = JSON.parse(rawBody)')
  assert.ok(lista > 0 && recusa > lista && confere > recusa && leitura > confere, 'lista, recusa, conferencia e so entao o corpo')
  assert.ok(fonte.slice(confere, leitura).includes("return text('Invalid signature', 401)"))
  // Nenhum segredo de app lido direto no webhook: a regra mora num lugar so.
  assert.ok(!/Deno\.env\.get\('(META_APP_SECRET|META_APP_SECRET_ECM|INSTAGRAM_APP_SECRET)'\)/.test(fonte))
})

conferirDesligar()
console.log(`assinatura do webhook: ${ok} casos passaram`)
