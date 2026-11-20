// Pecas comuns dos testes da coexistencia (porte de 19/11/2026 do sistema do
// Dr. Fabio): montar o modulo com o esbuild na hora do teste e, quando pedido,
// DESLIGAR uma regra para provar que o teste pega o defeito.
//
// DESLIGAR (variavel de ambiente) e uma lista JSON de trocas
// [{ "arquivo": "coexistencia.ts", "de": "...", "para": "..." }] aplicadas no
// codigo na hora de montar (ou de ler, nos testes que conferem o texto do
// arquivo), SEM mexer no arquivo de verdade. "arquivo" e o fim do caminho
// ("meta-webhook/index.ts"). Troca que nao acha o trecho para tudo: um
// "desligado" que nao desligou nada faria o teste parecer bom, e isso ja
// aconteceu neste projeto mais de uma vez (ver CLAUDE.md, "Testes").
import { build, buildSync } from 'esbuild'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const trocas = JSON.parse(process.env.DESLIGAR ?? '[]')
const usadas = new Set()
const doArquivo = (caminho) => trocas.filter((t) => caminho.replaceAll('\\', '/').endsWith(`/${t.arquivo}`))

/** O arquivo como texto (sem CR: o git no Windows grava CRLF), com as trocas de DESLIGAR. */
export function lerComTrocas(caminho) {
  let codigo = readFileSync(caminho, 'utf8').replaceAll('\r\n', '\n')
  for (const t of doArquivo(caminho)) {
    if (!codigo.includes(t.de)) throw new Error(`DESLIGAR: "${t.de.slice(0, 60)}" nao esta em ${t.arquivo}`)
    codigo = codigo.replace(t.de, t.para)
    usadas.add(t)
  }
  return codigo
}

const desligar = {
  name: 'desligar',
  setup(montagem) {
    montagem.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
      if (!doArquivo(args.path).length) return undefined
      return { contents: lerComTrocas(args.path), loader: args.path.endsWith('x') ? 'tsx' : 'ts' }
    })
  },
}

/** Monta o arquivo .ts (com tudo o que ele importa) e devolve o modulo. */
export async function montar(entrada, saida) {
  const opcoes = { entryPoints: [entrada], bundle: true, format: 'esm', outfile: saida, logLevel: 'warning' }
  // buildSync nao aceita plugin; com troca, vai pelo build assincrono.
  if (trocas.length) await build({ ...opcoes, plugins: [desligar] })
  else buildSync(opcoes)
  return import(`${pathToFileURL(saida).href}?v=${Date.now()}`)
}

/** Chamado no fim: toda troca pedida precisa ter sido aplicada em algum modulo. */
export function conferirDesligar() {
  const sobrou = trocas.filter((t) => !usadas.has(t))
  if (sobrou.length) throw new Error(`DESLIGAR: troca nao aplicada em nenhum modulo: ${sobrou.map((t) => t.arquivo).join(', ')}`)
}
