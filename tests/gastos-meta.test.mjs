// Gasto da conta de anuncios da Meta (supabase/functions/_shared/gastos-meta.ts).
// Pedido do Edu em 07/11/2026: ver o valor investido na aba da campanha, como
// no sistema do Dr. Marcello, com o token de 60 dias renovado pela propria funcao.
import assert from 'node:assert/strict'
import {
  escolherConta,
  gastoPorDiaRecente,
  hojeEmSaoPaulo,
  limiteAcabando,
  podeLerGasto,
  precisaRenovar,
  problemaDaConta,
  situacaoDaConta,
  situacaoParaGravar,
  somarInsights,
  vencimentoDoToken,
} from './gastos-meta.build.mjs'

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

const DIA = 24 * 3600 * 1000
const AGORA = Date.parse('2026-11-04T18:00:00Z')
const iso = (ms) => new Date(ms).toISOString()

caso('soma por dia e por anuncio, em centavos', () => {
  const g = somarInsights([
    { ad_id: '111', ad_name: 'Gastro Santos', spend: '10.11', date_start: '2026-11-03' },
    { ad_id: '222', ad_name: 'Gastro SP', spend: '5.2', date_start: '2026-11-03' },
    { ad_id: '111', ad_name: 'Gastro Santos', spend: '7', date_start: '2026-11-04' },
  ])
  assert.deepEqual(g.dias, { '2026-11-03': 15.31, '2026-11-04': 7 })
  assert.deepEqual(g.anuncios['111'], { nome: 'Gastro Santos', dias: { '2026-11-03': 10.11, '2026-11-04': 7 } })
  assert.equal(g.anuncios['222'].dias['2026-11-03'], 5.2)
})

caso('linha com gasto zero ou data estranha nao entra', () => {
  const g = somarInsights([
    { ad_id: '111', spend: '0', date_start: '2026-11-03' },
    { ad_id: '111', spend: 'abc', date_start: '2026-11-03' },
    { ad_id: '111', spend: '3', date_start: '03/11/2026' },
  ])
  assert.deepEqual(g, { dias: {}, anuncios: {} })
})

caso('hoje em Sao Paulo: 22h de 04/11 em Santos ainda e dia 04 (em UTC ja e 05)', () => {
  assert.equal(hojeEmSaoPaulo(new Date('2026-11-05T01:00:00Z')), '2026-11-04')
  assert.equal(hojeEmSaoPaulo(new Date('2026-11-05T03:00:00Z')), '2026-11-05')
})

caso('renova uma vez por semana enquanto o token vale', () => {
  const vence = iso(AGORA + 50 * DIA)
  assert.equal(precisaRenovar(vence, iso(AGORA - 2 * DIA), AGORA), false, 'renovado ha 2 dias')
  assert.equal(precisaRenovar(vence, iso(AGORA - 7 * DIA), AGORA), true, 'renovado ha 7 dias')
  assert.equal(precisaRenovar(vence, null, AGORA), true, 'nunca renovado')
})

caso('token vencido ou sem vencimento nao se renova', () => {
  assert.equal(precisaRenovar(iso(AGORA - DIA), iso(AGORA - 30 * DIA), AGORA), false, 'vencido: precisa de outro token')
  assert.equal(precisaRenovar(null, null, AGORA), false, 'sem vencimento')
})

caso('vencimento do debug_token: 0 e "nao vence"; vale o acesso aos dados se vier', () => {
  assert.equal(vencimentoDoToken(0, 0), null)
  assert.equal(vencimentoDoToken(1767225600, 0), '2026-01-01T00:00:00.000Z')
  assert.equal(vencimentoDoToken(0, 1767225600), '2026-01-01T00:00:00.000Z')
  assert.equal(vencimentoDoToken(1767225600, 1767312000), '2026-01-01T00:00:00.000Z', 'o que vencer primeiro')
})

caso('precisa de ads_read (ou ads_management)', () => {
  assert.equal(podeLerGasto(['public_profile', 'ads_read']), true)
  assert.equal(podeLerGasto(['ads_management']), true)
  assert.equal(podeLerGasto(['public_profile', 'pages_show_list']), false)
  assert.equal(podeLerGasto(undefined), false)
})

const PESSOAL = { id: '1111222233334444', nome: 'Patricia Zerbini' }
const OUTRA = { id: '999000111', nome: 'Outra empresa' }

caso('uma conta so: e ela', () => {
  assert.deepEqual(escolherConta([PESSOAL]), { ok: true, conta: PESSOAL })
})

caso('varias contas: nunca a primeira por sorte', () => {
  const r = escolherConta([OUTRA, PESSOAL])
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'escolher')
  assert.deepEqual(escolherConta([OUTRA, PESSOAL], 'act_1111222233334444'), { ok: true, conta: PESSOAL })
  assert.deepEqual(escolherConta([OUTRA, PESSOAL], null, '1111222233334444'), { ok: true, conta: PESSOAL }, 'a que ja estava ligada')
})

caso('a conta ligada sumiu do token: pergunta, nao troca sozinha', () => {
  const r = escolherConta([OUTRA], null, '1111222233334444')
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'nao_encontrada')
})

caso('nenhuma conta', () => {
  assert.equal(escolherConta([]).motivo, 'nenhuma')
})

// 07/11/2026: a conta da Dra. e pos-paga no cartao. Nao ha saldo para acabar;
// o que para os anuncios e cobranca recusada ou limite de gasto da conta.
caso('situacao da conta: centavos viram reais, spend_cap 0 e sem limite', () => {
  const s = situacaoDaConta({ account_status: 1, balance: '4161', amount_spent: '123456', spend_cap: '0', currency: 'BRL' }, new Date(AGORA))
  assert.equal(s.aPagar, 41.61)
  assert.equal(s.gastoTotal, 1234.56)
  assert.equal(s.limite, null)
  assert.equal(s.status, 1)
  assert.equal(s.motivo, null)
  assert.equal(problemaDaConta(s), null)
})

caso('situacao da conta: campo ausente fica nulo, nao zero', () => {
  const s = situacaoDaConta({}, new Date(AGORA))
  assert.equal(s.aPagar, null)
  assert.equal(s.status, null)
  assert.equal(problemaDaConta(s), null)
})

caso('cartao recusado e conta desativada viram alerta', () => {
  assert.match(problemaDaConta({ status: 3 }), /cobrar o cartão/)
  assert.match(problemaDaConta({ status: 2 }), /desativou/)
  assert.match(problemaDaConta({ status: 9 }), /atrasado/)
  assert.match(problemaDaConta({ status: 55 }), /situação 55/)
  assert.equal(problemaDaConta({ status: 201 }), null)
})

caso('limite da conta: avisa so quando o que resta da para menos de 3 dias', () => {
  assert.equal(limiteAcabando({ limite: null, gastoTotal: 900 }, 28), null, 'sem limite nao acaba')
  assert.equal(limiteAcabando({ limite: 1000, gastoTotal: 500 }, 28), null, 'sobra para 17 dias')
  const r = limiteAcabando({ limite: 1000, gastoTotal: 950 }, 28)
  assert.equal(r.restante, 50)
  assert.ok(r.dias > 1.7 && r.dias < 1.8)
  assert.deepEqual(limiteAcabando({ limite: 1000, gastoTotal: 1003.5 }, 28), { restante: 0, dias: 0 }, 'ja acabou')
  assert.equal(limiteAcabando({ limite: 1000, gastoTotal: 990 }, 0), null, 'sem gasto recente nao ha ritmo para prever')
})

caso('media por dia: ultimos 7 dias fechados, sem hoje', () => {
  const dias = { '2026-11-07': 500, '2026-11-06': 28, '2026-11-05': 28, '2026-10-31': 28, '2026-10-30': 999 }
  // A janela vai de 31/10 a 06/11: entram 06, 05 e 31/10; hoje (07) e 30/10 ficam de fora
  assert.equal(gastoPorDiaRecente(dias, '2026-11-07'), 12)
})

caso('o que vai para o banco junta a leitura e o que ela quer dizer', () => {
  const s = situacaoDaConta({ account_status: 3, balance: '11900', amount_spent: '96000', spend_cap: '100000' }, new Date(AGORA))
  const g = situacaoParaGravar(s, 28)
  assert.match(g.problema, /cobrar o cartão/)
  assert.equal(g.limiteRestante, 40)
  assert.equal(g.limiteDias, 1.4)
  const tranquilo = situacaoParaGravar(situacaoDaConta({ account_status: 1, amount_spent: '10000', spend_cap: '100000' }, new Date(AGORA)), 28)
  assert.equal(tranquilo.problema, null)
  assert.equal(tranquilo.limiteRestante, 900)
  assert.equal(tranquilo.limiteDias, null)
})

console.log(`gastos-meta: ${ok} verificacoes ok`)
