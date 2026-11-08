// Bloquear contato (supabase/functions/_shared/bloqueio.ts).
//
// Caso de 07/11/2026 (no sistema do Dr. Marcello): um numero sem cadastro
// mandava "[unsupported]" (talvez ligacao) quase todo dia, e cada uma avisava
// os celulares da equipe. Numero inventado: o repositorio e publico. O bloqueio tem duas camadas: no WhatsApp (API da Meta, que so
// aceita quem escreveu nas ultimas 24 horas) e na Central (o webhook ignora).
import assert from 'node:assert/strict'
import { bloquearNoWhatsApp, conferirBloqueio, lerRespostaDaMeta, pedidoDoBloqueio } from './bloqueio.build.mjs'

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

// O console.warn das falhas e esperado aqui; silencia para a saida ficar legivel.
const avisoOriginal = console.warn
console.warn = () => {}

// ---------------------------------------------------- a resposta da Meta

await caso('Bloqueio aceito: o numero volta em added_users', () => {
  const r = lerRespostaDaMeta(
    { messaging_product: 'whatsapp', block_users: { added_users: [{ input: '+5511900000001', wa_id: '5511900000001' }] } },
    true,
  )
  assert.deepEqual(r, { ok: true })
})

await caso('Recusa das 24 horas: HTTP 200 nao basta, vale o erro do proprio numero (131047)', () => {
  const r = lerRespostaDaMeta(
    {
      messaging_product: 'whatsapp',
      block_users: {
        added_users: [],
        failed_users: [{ input: '+5511900000001', errors: [{ code: 131047, message: 'Re-engagement message' }] }],
      },
      error: { code: 139100, message: 'Failed to block some users' },
    },
    true,
  )
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 131047, 'o 139100 geral nao diz o motivo; o do numero diz')
  assert.match(r.motivo, /24 horas/)
})

await caso('Erro geral sem lista (token vencido): nao bloqueou, com o codigo', () => {
  const r = lerRespostaDaMeta({ error: { code: 190, message: 'Invalid OAuth access token' } }, true)
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 190)
  assert.match(r.motivo, /190/)
})

await caso('Desbloqueio le removed_users, e nao added_users', () => {
  assert.deepEqual(lerRespostaDaMeta({ block_users: { removed_users: [{ input: '+5511900000001' }] } }, false), { ok: true })
  assert.equal(lerRespostaDaMeta({ block_users: { added_users: [{ input: '+5511900000001' }] } }, false).ok, false)
})

await caso('Resposta vazia ou estranha: nao bloqueou', () => {
  assert.equal(lerRespostaDaMeta(null, true).ok, false)
  assert.equal(lerRespostaDaMeta({}, true).codigo, null)
  assert.match(lerRespostaDaMeta({}, true).motivo, /WhatsApp/)
})

await caso('Pedido: numero com +, so digitos', () => {
  assert.deepEqual(pedidoDoBloqueio('55 (11) 90000-0001'), {
    messaging_product: 'whatsapp',
    block_users: [{ user: '+5511900000001' }],
  })
})

// ---------------------------------------------------- a chamada

function fetchDeMentira(corpo, { falhar = false } = {}) {
  const pedidos = []
  const fn = async (url, init) => {
    pedidos.push({ url, metodo: init.method, corpo: JSON.parse(init.body), auth: init.headers.Authorization })
    if (falhar) throw new Error('rede caiu')
    return { status: 200, json: async () => corpo }
  }
  return { fn, pedidos }
}

await caso('Bloquear e POST em /<numero da clinica>/block_users, com o token', async () => {
  const f = fetchDeMentira({ block_users: { added_users: [{ input: '+5511900000001' }] } })
  const r = await bloquearNoWhatsApp({ fetch: f.fn, versao: 'v25.0', phoneNumberId: '123', token: 'tk', waId: '5511900000001', bloquear: true })
  assert.deepEqual(r, { ok: true })
  assert.equal(f.pedidos[0].metodo, 'POST')
  assert.equal(f.pedidos[0].url, 'https://graph.facebook.com/v25.0/123/block_users')
  assert.equal(f.pedidos[0].auth, 'Bearer tk')
  assert.equal(f.pedidos[0].corpo.block_users[0].user, '+5511900000001')
})

await caso('Desbloquear e DELETE no mesmo endereco', async () => {
  const f = fetchDeMentira({ block_users: { removed_users: [{ input: '+5511900000001' }] } })
  const r = await bloquearNoWhatsApp({ fetch: f.fn, versao: 'v25.0', phoneNumberId: '123', token: 'tk', waId: '5511900000001', bloquear: false })
  assert.deepEqual(r, { ok: true })
  assert.equal(f.pedidos[0].metodo, 'DELETE')
})

await caso('Rede caiu: devolve "nao bloqueou", nunca lanca', async () => {
  const f = fetchDeMentira(null, { falhar: true })
  const r = await bloquearNoWhatsApp({ fetch: f.fn, versao: 'v25.0', phoneNumberId: '123', token: 'tk', waId: '5511900000001', bloquear: true })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /Tente de novo/)
})

// ---------------------------------------------------- o webhook

await caso('Numero bloqueado: o webhook sabe, e se a Meta ja bloqueou', async () => {
  assert.deepEqual(await conferirBloqueio(async () => [{ id: 'c1', bloqueado_no_whatsapp: false }]), { conversaId: 'c1', noWhatsApp: false })
  assert.deepEqual(await conferirBloqueio(async () => [{ id: 'c1', bloqueado_no_whatsapp: true }]), { conversaId: 'c1', noWhatsApp: true })
})

await caso('Numero normal: segue', async () => {
  assert.equal(await conferirBloqueio(async () => []), null)
})

await caso('Coluna ainda nao existe (migration atrasada): a mensagem do paciente segue, nao some', async () => {
  const r = await conferirBloqueio(async () => {
    throw new Error('column whatsapp_conversations.bloqueado_em does not exist')
  })
  assert.equal(r, null)
})

console.warn = avisoOriginal
console.log(`bloqueio: ${ok} verificacoes ok`)
