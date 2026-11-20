// Concluir a ligacao de um numero do WhatsApp (porte de 19/11/2026 do sistema
// do Dr. Fabio). Ver supabase/functions/_shared/conectar-numero.ts e, para a
// chave de cada numero, _shared/whatsapp-teste.ts. Sem Meta e sem banco: so as
// regras que a funcao whatsapp-conectar confere. Ids, chaves e enderecos
// inventados. Para provar que um caso pega o defeito, ver DESLIGAR em
// tests/montar-para-teste.mjs.
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conferirDesligar, lerComTrocas, montar } from './montar-para-teste.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SHARED = join(AQUI, '..', 'supabase', 'functions', '_shared')
const M = await montar(join(SHARED, 'conectar-numero.ts'), join(AQUI, 'conectar-numero.build.mjs'))
const K = await montar(join(SHARED, 'whatsapp-teste.ts'), join(AQUI, 'chave-do-numero.build.mjs'))

let ok = 0
function caso(nome, fn) {
  try {
    fn()
    ok++
  } catch (erro) {
    console.error(`FALHOU: ${nome}`)
    throw erro
  }
}

const CLINICA = 'b5d0f6a2-3c71-4e8a-9f2d-7a1c4e9b0d63'
const CLINICA_DE_TESTE = '0c1e7d55-9a42-4b7e-8f10-2d3a6b9c4e71'

caso('sem acao, lista', () => {
  assert.deepEqual(M.lerPedido({}), { ok: true, acao: 'listar', clinicId: null, phoneNumberId: null })
  assert.deepEqual(M.lerPedido(null), { ok: true, acao: 'listar', clinicId: null, phoneNumberId: null })
  assert.equal(M.lerPedido({ phone_number_id: '222222' }).phoneNumberId, '222222')
  assert.equal(M.lerPedido({ phone_number_id: '22/22' }).ok, false)
})

caso('acao desconhecida e recusada', () => {
  assert.equal(M.lerPedido({ acao: 'apagar' }).ok, false)
})

caso('conectar exige conta e numero so com algarismos', () => {
  assert.equal(M.lerPedido({ acao: 'conectar', waba_id: '123456', phone_number_id: '' }).ok, false)
  assert.equal(M.lerPedido({ acao: 'conectar', waba_id: '', phone_number_id: '123456' }).ok, false)
  // Um id com barra viraria outro endereco na chamada a Meta.
  assert.equal(M.lerPedido({ acao: 'conectar', waba_id: '123456/../me', phone_number_id: '123456' }).ok, false)
  assert.equal(M.lerPedido({ acao: 'conectar', waba_id: '123456', phone_number_id: '12345?x=1' }).ok, false)
  assert.equal(M.lerPedido({ acao: 'conectar', waba_id: 123456, phone_number_id: '1234567' }).ok, true)
})

caso('a clinica, quando vem, e um uuid', () => {
  const base = { acao: 'conectar', waba_id: '111111', phone_number_id: '222222' }
  assert.equal(M.lerPedido(base).clinicId, null)
  assert.equal(M.lerPedido({ ...base, clinic_id: CLINICA }).clinicId, CLINICA)
  assert.equal(M.lerPedido({ ...base, clinic_id: 'clinica-da-patricia' }).ok, false)
  assert.equal(M.lerPedido({ ...base, clinic_id: `${CLINICA}' or 1=1` }).ok, false)
})

caso('historico e pedido por padrao; so o false escrito desliga', () => {
  const base = { acao: 'conectar', waba_id: '111111', phone_number_id: '222222' }
  assert.equal(M.lerPedido(base).sincronizar, true)
  assert.equal(M.lerPedido({ ...base, sincronizar: undefined }).sincronizar, true)
  assert.equal(M.lerPedido({ ...base, sincronizar: 'nao' }).sincronizar, true)
  assert.equal(M.lerPedido({ ...base, sincronizar: false }).sincronizar, false)
})

caso('so o responsavel pela clinica liga o numero', () => {
  const dona = [{ clinic_id: CLINICA, role: 'owner' }]
  assert.deepEqual(M.clinicaDoResponsavel(dona, null), { ok: true, clinicId: CLINICA })
  assert.deepEqual(M.clinicaDoResponsavel(dona, CLINICA), { ok: true, clinicId: CLINICA })
  // Secretaria e medica convidada sao membros ativos, mas nao respondem pela clinica.
  for (const role of ['staff', 'clinician', 'viewer', undefined]) {
    const r = M.clinicaDoResponsavel([{ clinic_id: CLINICA, role }], null)
    assert.equal(r.ok, false, String(role))
    assert.equal(r.status, 403)
    assert.equal(r.code, 'SO_RESPONSAVEL')
  }
  assert.equal(M.clinicaDoResponsavel([], null).ok, false)
  assert.equal(M.clinicaDoResponsavel(null, null).ok, false)
  // Dona de uma clinica nao liga numero na outra, onde e so equipe.
  const mista = [{ clinic_id: CLINICA, role: 'staff' }, { clinic_id: CLINICA_DE_TESTE, role: 'owner' }]
  assert.equal(M.clinicaDoResponsavel(mista, CLINICA).ok, false)
  assert.deepEqual(M.clinicaDoResponsavel(mista, null), { ok: true, clinicId: CLINICA_DE_TESTE })
})

caso('responsavel por duas clinicas precisa dizer qual', () => {
  const duas = [{ clinic_id: CLINICA, role: 'owner' }, { clinic_id: CLINICA_DE_TESTE, role: 'owner' }]
  const r = M.clinicaDoResponsavel(duas, null)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'QUAL_CLINICA')
  assert.equal(r.status, 400)
  assert.deepEqual(M.clinicaDoResponsavel(duas, CLINICA_DE_TESTE), { ok: true, clinicId: CLINICA_DE_TESTE })
})

caso('le os numeros da conta e marca o que esta no app', () => {
  const numeros = M.lerNumeros({
    data: [
      { id: '222222', display_phone_number: '+55 13 90000-0001', verified_name: 'Consultório de teste', is_on_biz_app: true },
      { id: '333333', display_phone_number: '+1 555 000 0000', verified_name: 'Teste' },
      { id: 'x', display_phone_number: 'lixo' },
    ],
  })
  assert.equal(numeros.length, 2)
  assert.equal(numeros[0].noApp, true)
  assert.equal(numeros[1].noApp, false)
  assert.deepEqual(M.lerNumeros(null), [])
  assert.deepEqual(M.lerNumeros({ data: 'x' }), [])
})

caso('le as contas compartilhadas com os numeros de cada uma', () => {
  const contas = M.lerContas({
    data: [
      { id: '111111', name: 'Conta de teste', phone_numbers: { data: [{ id: '222222', is_on_biz_app: true }] } },
      { id: '444444', name: 'Sem número' },
    ],
  })
  assert.equal(contas.length, 2)
  assert.equal(contas[0].numeros[0].id, '222222')
  assert.deepEqual(contas[1].numeros, [])
})

caso('numero de outra conta nao confere', () => {
  const numeros = M.lerNumeros({ data: [{ id: '222222' }] })
  assert.equal(M.numeroDaConta(numeros, '222222').id, '222222')
  assert.equal(M.numeroDaConta(numeros, '999999'), null)
})

caso('contatos sao pedidos antes do historico', () => {
  assert.deepEqual(
    M.SINCRONIAS.map((s) => s.tipo),
    ['smb_app_state_sync', 'history'],
  )
})

caso('a ligacao vale sem historico, mas nao sem os avisos', () => {
  const certo = [
    { passo: 'Número da conta', ok: true },
    { passo: 'Avisos da conta', ok: true },
  ]
  assert.equal(M.ligacaoValeu(certo), true)
  assert.equal(M.ligacaoValeu([...certo, { passo: 'Histórico de conversas', ok: false, motivo: 'prazo' }]), true)
  assert.equal(M.ligacaoValeu([certo[0], { passo: 'Avisos da conta', ok: false }]), false)
  assert.equal(M.ligacaoValeu([certo[0]]), false)
  assert.equal(M.ligacaoValeu([]), false)
})

caso('o desvio do webhook aponta para o meta-webhook do proprio projeto, e so com o segredo "sim"', () => {
  const ambiente = (valores) => (nome) => valores[nome]
  const base = { SUPABASE_URL: 'https://projetodeteste.supabase.co/', WHATSAPP_VERIFY_TOKEN: 'senha-inventada' }
  // Sem o segredo, nada muda: assina sem desvio, como um app de webhook proprio.
  assert.deepEqual(M.desvioDoWebhook(ambiente(base)), { ok: true, desvio: null })
  assert.deepEqual(M.desvioDoWebhook(ambiente({ ...base, WHATSAPP_WEBHOOK_PROPRIO: 'nao' })), { ok: true, desvio: null })
  assert.deepEqual(M.desvioDoWebhook(ambiente({ ...base, WHATSAPP_WEBHOOK_PROPRIO: ' SIM ' })), {
    ok: true,
    desvio: { override_callback_uri: 'https://projetodeteste.supabase.co/functions/v1/meta-webhook', verify_token: 'senha-inventada' },
  })
  // Pediu desvio e falta peca: para antes de falar com a Meta.
  assert.equal(M.desvioDoWebhook(ambiente({ WHATSAPP_WEBHOOK_PROPRIO: 'sim', SUPABASE_URL: base.SUPABASE_URL })).ok, false)
  assert.equal(M.desvioDoWebhook(ambiente({ WHATSAPP_WEBHOOK_PROPRIO: 'sim', WHATSAPP_VERIFY_TOKEN: 'senha-inventada' })).ok, false)
})

caso('o motivo da Meta vai para a resposta, e a falta dele tambem e dita', () => {
  assert.equal(M.motivoDaMeta({ error: { error_user_title: 'Prazo vencido', error_user_msg: 'Passaram as 24 horas.' } }), 'Prazo vencido: Passaram as 24 horas.')
  assert.equal(M.motivoDaMeta({ error: { message: '(#100) Invalid parameter' } }), '(#100) Invalid parameter')
  assert.equal(M.motivoDaMeta(null), 'A Meta não explicou o motivo.')
  assert.equal(M.motivoDaMeta({ error: {} }), 'A Meta não explicou o motivo.')
})

// ---------------------------------------------------------------------------
// A chave de cada numero: o que muda (e o que nao muda) no dia da troca
// ---------------------------------------------------------------------------

const ANTIGO = '700000000000001'
const NOVO = '700000000000002'

caso('antes da troca: so a chave geral, e todo numero usa ela', () => {
  const hoje = (nome) => ({ WHATSAPP_ACCESS_TOKEN: 'chave-de-hoje', META_APP_ID: '9000001' })[nome]
  assert.equal(K.chaveDoWhatsApp(ANTIGO, hoje), 'chave-de-hoje')
  assert.equal(K.chaveDoWhatsApp(null, hoje), 'chave-de-hoje')
  assert.equal(K.origemDaChave(ANTIGO, hoje), 'geral')
  assert.equal(K.appDoWhatsApp(ANTIGO, hoje), '9000001')
})

caso('no dia: o numero novo usa a chave dele, e o antigo continua na de sempre (plano B)', () => {
  const noDia = (nome) =>
    ({
      WHATSAPP_ACCESS_TOKEN: 'chave-de-hoje',
      [`WHATSAPP_ACCESS_TOKEN_${NOVO}`]: 'chave-da-ecm',
      META_APP_ID: '9000001',
      [`META_APP_ID_${NOVO}`]: '9000002',
    })[nome]
  assert.equal(K.chaveDoWhatsApp(NOVO, noDia), 'chave-da-ecm')
  assert.equal(K.origemDaChave(NOVO, noDia), 'do_numero')
  assert.equal(K.appDoWhatsApp(NOVO, noDia), '9000002')
  // Criar o segredo do numero novo nao muda nada para o numero de hoje: pode
  // ser criado antes, e desfazer (voltar ao numero antigo) volta a chave antiga.
  assert.equal(K.chaveDoWhatsApp(ANTIGO, noDia), 'chave-de-hoje')
  assert.equal(K.origemDaChave(ANTIGO, noDia), 'geral')
  assert.equal(K.appDoWhatsApp(ANTIGO, noDia), '9000001')
})

caso('segredo do numero com o nome errado cai na geral, e a origem diz isso', () => {
  const errado = (nome) => ({ WHATSAPP_ACCESS_TOKEN: 'chave-de-hoje', WHATSAPP_ACCESS_TOKEN_70000000000002: 'chave-da-ecm' })[nome]
  assert.equal(K.chaveDoWhatsApp(NOVO, errado), 'chave-de-hoje')
  assert.equal(K.origemDaChave(NOVO, errado), 'geral', 'e o que a whatsapp-conectar devolve em "chave"')
  assert.equal(K.origemDaChave(NOVO, () => undefined), null)
  assert.equal(K.origemDaChave(NOVO, (nome) => (nome === `WHATSAPP_ACCESS_TOKEN_${NOVO}` ? '   ' : undefined)), null)
})

// ---------------------------------------------------------------------------
// A funcao: a ordem dos passos e quem pode chamar
// ---------------------------------------------------------------------------

caso('whatsapp-conectar: confere quem chama, o banco e o numero antes de assinar; grava antes do historico', () => {
  const fonte = lerComTrocas(join(AQUI, '..', 'supabase', 'functions', 'whatsapp-conectar', 'index.ts'))
  const posicao = (trecho) => {
    const i = fonte.indexOf(trecho)
    assert.ok(i > 0, `nao achei: ${trecho}`)
    return i
  }
  const sessao = posicao('await userClient(autorizacao).auth.getUser()')
  const papel = posicao('const dono = clinicaDoResponsavel(vinculos, pedido.clinicId)')
  const recusa = posicao('return json({ error: dono.erro, code: dono.code }, dono.status)')
  const permissao = posicao("code: 'BANCO_NAO_PRONTO'")
  const confere = posicao('/phone_numbers?fields=')
  const assina = posicao('/subscribed_apps`')
  const grava = posicao('.update({ whatsapp_waba_id: pedido.wabaId, whatsapp_phone_number_id: pedido.phoneNumberId })')
  const historico = posicao('/smb_app_data`')
  assert.ok(sessao < papel && papel < recusa && recusa < permissao, 'sessao, papel e recusa antes de qualquer coisa')
  assert.ok(permissao < confere && confere < assina && assina < grava && grava < historico, 'banco, numero, avisos, gravar, historico')
  // O papel e conferido com o id de quem chama, pelo servidor.
  assert.match(fonte, /\.from\('clinic_memberships'\)\s+\.select\('clinic_id,role'\)\s+\.eq\('user_id', usuario\.user\.id\)\s+\.eq\('status', 'active'\)/)
  // A chave e a que o robo usa para aquele numero, e a resposta diz qual foi.
  assert.ok(fonte.includes('const token = chaveDoWhatsApp(pedido.phoneNumberId)'))
  assert.ok(fonte.includes('const chave = origemDaChave(pedido.phoneNumberId)'))
  // Devolve o numero anterior, para desfazer.
  assert.match(fonte, /return json\(\{\s+ok: ligacaoValeu\(passos\),\s+numero,\s+anterior,/)
  // Nenhum id de projeto, de conta ou de numero escrito no codigo.
  // (O unico numero comprido permitido e o nome de uma migration, que comeca pelo ano.)
  assert.ok(!/\b(?!2026\d{10}\b)\d{12,}\b/.test(fonte), 'sem id da Meta no arquivo')
  assert.ok(!/[a-z]{20}\.supabase\.co/.test(fonte), 'sem endereco de projeto no arquivo')
})

caso('a funcao esta registrada no config.toml (com JWT) e no deploy', () => {
  const config = lerComTrocas(join(AQUI, '..', 'supabase', 'config.toml'))
  assert.match(config, /\[functions\.whatsapp-conectar\]\n(#.*\n)*verify_jwt = true/)
  const deploy = lerComTrocas(join(AQUI, '..', '.github', 'workflows', 'deploy-pages.yml'))
  assert.ok(deploy.includes('supabase functions deploy whatsapp-conectar --project-ref "$PROJECT_REF"'))
})

conferirDesligar()
console.log(`conectar-numero: ${ok} casos passaram`)
