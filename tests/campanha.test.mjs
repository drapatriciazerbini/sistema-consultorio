// As contas da aba Campanha da Visao geral (src/lib/campanha.ts).
// Pedido do Edu em 07/11/2026: ver o valor investido e o custo por consulta,
// como no sistema do Dr. Marcello. Datas montadas no fuso local: o teste nao depende do
// fuso da maquina.
import assert from 'node:assert/strict'
import {
  alertasDaConta,
  consultaDepoisDaChegada,
  gastoGoogleNaJanela,
  gastoMetaNaJanela,
  investimento,
  janelaAnterior,
  janelaDoMes,
  janelaDosUltimos,
  numeros,
  porAnuncio,
  serieDiaria,
  situacaoDoGoogle,
  situacaoDoToken,
} from './campanha.build.mjs'

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
// 04/11/2026 15h no fuso local
const AGORA = new Date(2026, 10, 4, 15).getTime()
const local = (mes, dia, hora = 10) => new Date(2026, mes - 1, dia, hora).toISOString()

function contato(extra = {}) {
  return {
    conversaId: 'c1',
    nome: 'Familia',
    telefone: '',
    plataforma: 'meta',
    origem: 'instagram',
    chegouEm: local(11, 2),
    anuncioId: null,
    tituloDoAnuncio: null,
    respondeu: true,
    consultaEm: null,
    consultaMarcadaEm: null,
    consultaCancelada: false,
    veio: false,
    ...extra,
  }
}

// ------------------------------------------------------------ consulta depois da chegada

caso('marcou pelo cadastro do paciente, fora da conversa do anuncio: conta', () => {
  // A familia chegou pelo anuncio e a recepcao marcou pelo telefone: a consulta
  // nao tem conversation_id. Antes de 04/11 aparecia "sem consulta".
  const r = consultaDepoisDaChegada(
    [{ conversationId: null, patientId: 'p1', startsAt: local(11, 10), createdAt: local(11, 3), status: 'scheduled' }],
    'c1',
    'p1',
    local(11, 2),
  )
  assert.equal(r.consultaEm, local(11, 10))
  assert.equal(r.cancelada, false)
})

caso('consulta marcada antes da chegada nao conta (paciente antigo que clicou no anuncio)', () => {
  const r = consultaDepoisDaChegada(
    [{ conversationId: 'c1', patientId: 'p1', startsAt: local(11, 10), createdAt: local(9, 20), status: 'scheduled' }],
    'c1',
    'p1',
    local(11, 2),
  )
  assert.equal(r.consultaEm, null)
})

caso('consulta de outro paciente nao conta', () => {
  const r = consultaDepoisDaChegada(
    [{ conversationId: 'c9', patientId: 'p9', startsAt: local(11, 10), createdAt: local(11, 3), status: 'scheduled' }],
    'c1',
    'p1',
    local(11, 2),
  )
  assert.equal(r.consultaEm, null)
})

caso('so cancelada: marcou e cancelou; com presenca: veio', () => {
  const cancelada = consultaDepoisDaChegada(
    [{ conversationId: 'c1', patientId: null, startsAt: local(11, 10), createdAt: local(11, 3), status: 'cancelled' }],
    'c1',
    null,
    local(11, 2),
  )
  assert.equal(cancelada.cancelada, true)
  const veio = consultaDepoisDaChegada(
    [{ conversationId: 'c1', patientId: null, startsAt: local(11, 3, 14), createdAt: local(11, 2, 11), status: 'attended' }],
    'c1',
    null,
    local(11, 2),
  )
  assert.equal(veio.veio, true)
})

caso('funil: cancelada nao conta como marcou; quem veio conta', () => {
  const n = numeros([
    contato({ consultaEm: local(11, 10) }),
    contato({ consultaEm: local(11, 10), consultaCancelada: true }),
    contato({ consultaEm: local(11, 3), veio: true, respondeu: false }),
    contato(),
  ])
  assert.deepEqual(n, { contatos: 4, responderam: 3, marcaram: 2, vieram: 1 })
})

// ------------------------------------------------------------ janelas

caso('7 dias contam hoje inteiro e os 6 anteriores', () => {
  const j = janelaDosUltimos(7, AGORA)
  assert.equal(j.fim, new Date(2026, 10, 5).getTime())
  assert.equal(j.inicio, new Date(2026, 9, 29).getTime())
  const antes = janelaAnterior(j)
  assert.equal(antes.fim, j.inicio)
  assert.equal(antes.fim - antes.inicio, 7 * DIA)
})

caso('mes fechado compara com o mes anterior inteiro', () => {
  const antes = janelaAnterior(janelaDoMes('2026-11'))
  assert.equal(antes.mes, '2026-10')
  assert.equal(antes.inicio, new Date(2026, 9, 1).getTime())
})

// ------------------------------------------------------------ gasto

const META = {
  dias: { '2026-10-28': 20, '2026-11-01': 15, '2026-11-04': 10 },
  anuncios: {
    111: { nome: 'Gastro Santos', dias: { '2026-11-01': 15, '2026-11-04': 10 } },
    222: { nome: 'Gastro SP', dias: { '2026-10-28': 20 } },
  },
}

caso('gasto da Meta soma so os dias da janela', () => {
  assert.equal(gastoMetaNaJanela(META, janelaDoMes('2026-11')), 25)
  assert.equal(gastoMetaNaJanela(META, janelaDosUltimos(7, AGORA)), 25)
  assert.equal(gastoMetaNaJanela(META, janelaDosUltimos(30, AGORA)), 45)
})

caso('Google do mes fechado: inteiro no mes, proporcional num pedaco dele', () => {
  const google = { '2026-10': 310 }
  assert.equal(gastoGoogleNaJanela(google, janelaDoMes('2026-10'), AGORA), 310)
  // 29 a 31/10: 3 dos 31 dias de outubro
  const tres = { inicio: new Date(2026, 9, 29).getTime(), fim: new Date(2026, 10, 1).getTime() }
  assert.equal(gastoGoogleNaJanela(google, tres, AGORA), 30)
})

caso('Google do mes corrente: o valor e "ate hoje", espalhado so pelos dias ja passados', () => {
  // Lancado 100 em 04/11: sao 4 dias, 25 por dia. Os ultimos 7 dias pegam
  // 01 a 04/11 inteiros, e nao 7/30 de 100.
  assert.equal(gastoGoogleNaJanela({ '2026-11': 100 }, janelaDosUltimos(7, AGORA), AGORA), 100)
  assert.equal(gastoGoogleNaJanela({ '2026-11': 100 }, janelaDosUltimos(2, AGORA), AGORA), 50)
})

caso('investimento por filtro: so as plataformas pedidas; organico nao tem custo', () => {
  const gastos = { meta: META, google: { '2026-11': 100 } }
  const j = janelaDoMes('2026-11')
  assert.equal(investimento(gastos, j, ['meta', 'google'], AGORA), 125)
  assert.equal(investimento(gastos, j, ['google'], AGORA), 100)
  assert.equal(investimento(gastos, j, ['organico'], AGORA), 0)
  assert.equal(investimento(null, j, ['meta'], AGORA), 0)
})

// ------------------------------------------------------------ anuncios

caso('anuncio que gastou e nao trouxe ninguem aparece; sem codigo fica em linha propria', () => {
  const lista = [
    contato({ conversaId: 'a', anuncioId: '111', tituloDoAnuncio: 'Gastropediatra em Santos', consultaEm: local(11, 10) }),
    contato({ conversaId: 'b', anuncioId: '111' }),
    contato({ conversaId: 'c', anuncioId: null }),
    contato({ conversaId: 'g', plataforma: 'google', origem: 'google' }),
  ]
  const linhas = porAnuncio(lista, META, janelaDosUltimos(30, AGORA))
  const santos = linhas.find((l) => l.id === '111')
  assert.deepEqual(
    { titulo: santos.titulo, contatos: santos.contatos, marcaram: santos.marcaram, gasto: santos.gasto },
    { titulo: 'Gastropediatra em Santos', contatos: 2, marcaram: 1, gasto: 25 },
  )
  const sp = linhas.find((l) => l.id === '222')
  assert.equal(sp.contatos, 0)
  assert.equal(sp.gasto, 20)
  assert.equal(linhas.find((l) => l.chave === 'sem-codigo').contatos, 1)
  assert.equal(linhas.length, 3, 'o Google nao entra nos anuncios da Meta')
  assert.equal(linhas[0].id, '111', 'quem marcou primeiro')
})

// ------------------------------------------------------------ ritmo

caso('ritmo: um ponto por dia, por plataforma', () => {
  const j = janelaDosUltimos(3, AGORA)
  const dias = serieDiaria(
    [
      contato({ chegouEm: local(11, 4, 9) }),
      contato({ chegouEm: local(11, 4, 20), plataforma: 'organico', consultaEm: local(11, 9) }),
      contato({ chegouEm: local(11, 2, 8), plataforma: 'google' }),
      contato({ chegouEm: local(10, 20) }),
    ],
    j,
  )
  assert.deepEqual(
    dias.map((d) => d.rotulo),
    ['02/11', '03/11', '04/11'],
  )
  assert.deepEqual(dias[2].porPlataforma, { meta: 1, google: 0, organico: 1 })
  assert.equal(dias[2].marcaram, 1)
  assert.equal(dias[0].porPlataforma.google, 1)
})

// ------------------------------------------------------------ token

caso('token: aviso 10 dias antes, erro vencido, ok no resto', () => {
  const base = { metaConta: '1111222233334444', metaErro: null }
  assert.equal(situacaoDoToken({ ...base, metaTokenExpiraEm: new Date(AGORA + 40 * DIA).toISOString() }, AGORA).tom, 'ok')
  assert.equal(situacaoDoToken({ ...base, metaTokenExpiraEm: new Date(AGORA + 9 * DIA).toISOString() }, AGORA).tom, 'aviso')
  assert.equal(situacaoDoToken({ ...base, metaTokenExpiraEm: new Date(AGORA - DIA).toISOString() }, AGORA).tom, 'erro')
  assert.equal(situacaoDoToken({ ...base, metaTokenExpiraEm: new Date(AGORA + 40 * DIA).toISOString(), metaErro: 'Invalid OAuth' }, AGORA).tom, 'erro')
  assert.equal(situacaoDoToken({ metaConta: null }, AGORA).tom, 'aviso')
})

// 05/11/2026: o gasto do Google por dia, mandado pelo script da conta.
caso('Google automatico: do primeiro dia do script em diante, o lancado a mao nao conta (nada em dobro)', () => {
  const google = { '2026-10': 173.15, '2026-11': 60 }
  const auto = { desde: '2026-10-01', ate: '2026-11-04', dias: { '2026-10-20': 10, '2026-10-31': 5, '2026-11-03': 24.14 } }
  assert.equal(gastoGoogleNaJanela(google, janelaDoMes('2026-10'), AGORA), 173.15, 'sem script: o lancado a mao')
  assert.equal(gastoGoogleNaJanela(google, janelaDoMes('2026-10'), AGORA, auto), 15, 'com script desde 01/10: so o do script')
  assert.equal(gastoGoogleNaJanela(google, janelaDoMes('2026-11'), AGORA, auto), 24.14)
  assert.equal(gastoGoogleNaJanela(google, janelaDosUltimos(7, AGORA), AGORA, auto), 29.14)
  // script vazio (ou antiga linha sem "desde") nao zera o lancado a mao
  assert.equal(gastoGoogleNaJanela(google, janelaDoMes('2026-10'), AGORA, {}), 173.15)
  assert.equal(gastoGoogleNaJanela(google, janelaDoMes('2026-10'), AGORA, null), 173.15)
})

caso('Google automatico no meio do mes: o lancado a mao vale so para os dias antes do script', () => {
  // outubro lancado a mao (310 no mes inteiro); o script so le desde 17/10
  const auto = { desde: '2026-10-17', dias: { '2026-10-20': 10 } }
  const antes = (310 * 16) / 31
  assert.equal(gastoGoogleNaJanela({ '2026-10': 310 }, janelaDoMes('2026-10'), AGORA, auto), Math.round((antes + 10) * 100) / 100)
})

caso('investimento soma o Google do script', () => {
  const gastos = { meta: {}, google: { '2026-11': 100 }, googleAuto: { desde: '2026-10-01', dias: { '2026-11-03': 24.14 } } }
  assert.equal(investimento(gastos, janelaDoMes('2026-11'), ['google'], AGORA), 24.14)
})

caso('situacao do Google: sem script, gerado sem relatorio, em dia, atrasado, parado, com erro', () => {
  const hora = 3600 * 1000
  const em = (h) => new Date(AGORA - h * hora).toISOString()
  assert.equal(situacaoDoGoogle(null, AGORA), null)
  assert.equal(situacaoDoGoogle({ googleChaveCriadaEm: null, googleAutoEm: null }, AGORA), null, 'sem script: vale o aviso do mes lancado a mao')
  const base = { googleChaveCriadaEm: em(48), googleConta: '123-456-7890', googleErro: null, googleErroEm: null }
  assert.equal(situacaoDoGoogle({ ...base, googleAutoEm: null }, AGORA).tom, 'aviso')
  assert.match(situacaoDoGoogle({ ...base, googleAutoEm: null }, AGORA).texto, /Cole o script/)
  assert.equal(situacaoDoGoogle({ ...base, googleAutoEm: em(0.5) }, AGORA).tom, 'ok')
  assert.match(situacaoDoGoogle({ ...base, googleAutoEm: em(0.5) }, AGORA).texto, /123-456-7890/)
  assert.equal(situacaoDoGoogle({ ...base, googleAutoEm: em(4) }, AGORA).tom, 'aviso')
  assert.equal(situacaoDoGoogle({ ...base, googleAutoEm: em(27) }, AGORA).tom, 'erro')
  // erro depois do ultimo relatorio grita; erro antigo, ja superado por um relatorio bom, nao
  assert.equal(situacaoDoGoogle({ ...base, googleAutoEm: em(2), googleErro: 'AuthorizationError', googleErroEm: em(1) }, AGORA).tom, 'erro')
  assert.equal(situacaoDoGoogle({ ...base, googleAutoEm: em(1), googleErro: 'velho', googleErroEm: em(2) }, AGORA).tom, 'ok')
  // desligado na Central com numeros antigos guardados
  assert.equal(situacaoDoGoogle({ ...base, googleChaveCriadaEm: null, googleAutoEm: em(30) }, AGORA).tom, 'aviso')
})

// 07/11/2026: a conta da Meta e pos-paga; o alerta e de conta parada ou limite no fim.
caso('alertas da conta da Meta', () => {
  assert.deepEqual(alertasDaConta(null), [])
  const bem = { aPagar: 41.61, status: 1, limite: null, gastoTotal: 1000, lidoEm: '', problema: null, limiteRestante: null, limiteDias: null }
  assert.deepEqual(alertasDaConta(bem), [])
  const parada = alertasDaConta({ ...bem, status: 3, problema: 'A Meta não conseguiu cobrar o cartão' })
  assert.equal(parada.length, 1)
  assert.equal(parada[0].tom, 'erro')
  const acabando = alertasDaConta({ ...bem, limite: 1000, limiteRestante: 50, limiteDias: 1.7 })
  assert.equal(acabando[0].tom, 'aviso')
  assert.match(acabando[0].texto, /restam R\$\s?50,00, cerca de 2 dias/)
  const acabou = alertasDaConta({ ...bem, limite: 1000, limiteRestante: 0, limiteDias: 0 })
  assert.equal(acabou[0].tom, 'erro')
  assert.match(acabou[0].texto, /acabou/)
})

console.log(`campanha: ${ok} verificacoes ok`)
