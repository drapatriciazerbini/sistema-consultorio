// Espera pela Memed (src/lib/memed-carga.ts).
//
// Caso de 06/11/2026: a Memed passou a abrir, para este parceiro, a tela nova
// (V4), que nao cria o iframe "mdhub-module-plataforma.prescricao" - o sinal de
// pronta deste sistema. A espera ia ate o prazo e falhava; o segundo clique
// abria por acaso. Aqui o navegador e de mentira: relogio manual, script, hub e
// sinal que "chegam" quando o teste manda.
import assert from 'node:assert/strict'
import { criarEsperaDaMemed, LIMITE_SEM_SINAL_MS, memedAceitaComando, PRAZO_DA_MEMED_MS } from './memed-carga.build.mjs'

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

/** Relogio manual: avancar(ms) roda os intervalos e prazos que venceram. */
function criarRelogio() {
  let agora = 0
  let proximo = 1
  const tarefas = new Map()
  return {
    agora: () => agora,
    setInterval: (fn, ms) => {
      const id = proximo++
      tarefas.set(id, { fn, ms, quando: agora + ms, repete: true })
      return id
    },
    setTimeout: (fn, ms) => {
      const id = proximo++
      tarefas.set(id, { fn, ms, quando: agora + ms, repete: false })
      return id
    },
    clearInterval: (id) => tarefas.delete(id),
    clearTimeout: (id) => tarefas.delete(id),
    async avancar(ms) {
      const alvo = agora + ms
      for (;;) {
        let id = null
        let t = null
        for (const [i, tarefa] of tarefas) if (tarefa.quando <= alvo && (!t || tarefa.quando < t.quando)) [id, t] = [i, tarefa]
        if (!t) break
        agora = t.quando
        if (t.repete) t.quando += t.ms
        else tarefas.delete(id)
        t.fn()
        await Promise.resolve()
      }
      agora = alvo
      await new Promise((r) => setImmediate(r))
    },
  }
}

/** Uma pagina de mentira com a Memed carregando devagar. */
function criarPagina() {
  const pagina = { scripts: 0, temScript: false, hub: undefined, pronta: false, erro: null, ganchos: 0, semSinal: 0 }
  const relogio = criarRelogio()
  const ambiente = {
    temScript: () => pagina.temScript,
    inserirScript: () => {
      pagina.scripts++
      pagina.temScript = true
      pagina.erro = null
    },
    hub: () => pagina.hub,
    moduloPronto: () => pagina.pronta,
    erroDoScript: () => pagina.erro,
    prepararHub: () => {
      pagina.ganchos++
    },
    semSinal: () => {
      pagina.semSinal++
    },
    relogio,
  }
  return { pagina, relogio, espera: criarEsperaDaMemed(ambiente) }
}

/** Situacao de uma promessa sem esperar por ela. */
function situacao(promessa) {
  const s = { estado: 'pendente', erro: null }
  promessa.then(
    () => (s.estado = 'pronta'),
    (e) => {
      s.estado = 'recusada'
      s.erro = e
    },
  )
  return s
}

// ---------------------------------------------------- o sinal de pronta

await caso('V4 carregada: pronta SEM o iframe da tela antiga (o defeito de 06/11)', () => {
  assert.equal(memedAceitaComando({ phase: 'v4', v4Ready: true }, false), true)
})
await caso('V4 ainda baixando: nao esta pronta', () => {
  assert.equal(memedAceitaComando({ phase: 'v4', v4Ready: false }, false), false)
})
await caso('Memed ainda decidindo entre V4 e antiga: nao esta pronta', () => {
  assert.equal(memedAceitaComando({ phase: 'deciding' }, true), false)
  assert.equal(memedAceitaComando({ phase: 'waiting' }, true), false)
})
await caso('Tela antiga: vale o iframe, com ou sem o portao', () => {
  assert.equal(memedAceitaComando({ phase: 'legacy' }, true), true)
  assert.equal(memedAceitaComando({ phase: 'legacy' }, false), false)
  assert.equal(memedAceitaComando(undefined, true), true)
  assert.equal(memedAceitaComando(undefined, false), false, 'so o hub nao basta (21/09/2026)')
})

// ---------------------------------------------------- a espera

await caso('Tela antiga lenta: espera o sinal e abre, sem seguir antes da hora', async () => {
  const { pagina, relogio, espera } = criarPagina()
  const s = situacao(espera.esperar())
  await relogio.avancar(5_000)
  pagina.hub = {}
  await relogio.avancar(LIMITE_SEM_SINAL_MS - 3_000)
  assert.equal(s.estado, 'pendente', 'hub sem sinal ainda dentro do limite')
  pagina.pronta = true
  await relogio.avancar(100)
  assert.equal(s.estado, 'pronta')
  assert.equal(pagina.semSinal, 0, 'veio pelo sinal, nao pela rede de seguranca')
  assert.equal(pagina.scripts, 1)
})

await caso('Hub na pagina e sinal nenhum (a proxima troca da Memed): segue no limite e avisa', async () => {
  const { pagina, relogio, espera } = criarPagina()
  pagina.hub = {}
  const s = situacao(espera.esperar())
  await relogio.avancar(LIMITE_SEM_SINAL_MS + 200)
  assert.equal(s.estado, 'pronta', 'nao espera ate o prazo final')
  assert.equal(pagina.semSinal, 1)
  // dai em diante, o hub basta: o proximo clique abre na hora
  assert.equal(espera.pronta(), true)
  assert.equal(pagina.semSinal, 1, 'avisa uma vez so')
})

await caso('Sem hub nenhum: recusa no prazo, com o que fazer', async () => {
  const { relogio, espera } = criarPagina()
  const s = situacao(espera.esperar())
  await relogio.avancar(PRAZO_DA_MEMED_MS + 100)
  assert.equal(s.estado, 'recusada')
  assert.match(s.erro.message, /Ctrl\+F5/)
})

await caso('Dois cliques seguidos esperam a mesma carga: um script so', async () => {
  const { pagina, relogio, espera } = criarPagina()
  const a = espera.esperar()
  const b = espera.esperar()
  assert.equal(a, b)
  pagina.hub = {}
  pagina.pronta = true
  await relogio.avancar(100)
  assert.equal(pagina.scripts, 1)
})

await caso('Depois do prazo, a nova tentativa espera o MESMO script', async () => {
  const { pagina, relogio, espera } = criarPagina()
  const s = situacao(espera.esperar())
  await relogio.avancar(PRAZO_DA_MEMED_MS + 100)
  assert.equal(s.estado, 'recusada')
  pagina.hub = {}
  pagina.pronta = true
  const s2 = situacao(espera.esperar())
  await relogio.avancar(100)
  assert.equal(s2.estado, 'pronta')
  assert.equal(pagina.scripts, 1, 'nunca um segundo script na pagina')
})

await caso('Falha de rede do script: recusa logo, e a nova tentativa poe o script de novo', async () => {
  const { pagina, relogio, espera } = criarPagina()
  const s = situacao(espera.esperar())
  // o ambiente real tira o script da pagina e deixa o motivo
  pagina.temScript = false
  pagina.erro = new Error('Não foi possível carregar a prescrição da Memed.')
  await relogio.avancar(100)
  assert.equal(s.estado, 'recusada')
  assert.match(s.erro.message, /Não foi possível carregar/)
  const s2 = situacao(espera.esperar())
  assert.equal(pagina.scripts, 2)
  pagina.hub = {}
  pagina.pronta = true
  await relogio.avancar(100)
  assert.equal(s2.estado, 'pronta')
})

await caso('pronta() responde sem carregar nada', async () => {
  const { pagina, espera } = criarPagina()
  assert.equal(espera.pronta(), false)
  assert.equal(pagina.scripts, 0, 'perguntar nao poe script')
  pagina.hub = {}
  pagina.pronta = true
  assert.equal(espera.pronta(), true)
})

console.log(`memed-carga: ${ok} verificacoes ok`)
