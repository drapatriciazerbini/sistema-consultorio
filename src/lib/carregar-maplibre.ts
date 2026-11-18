import type * as ML from 'maplibre-gl'

/**
 * Busca a biblioteca do mapa real so quando alguem precisa dela (18/11/2026,
 * porte do sistema de origem).
 *
 * Por que nao um `import('maplibre-gl')` comum: o site da Central e montado
 * num arquivo so (vite-plugin-singlefile), e nele ate o que e "carregado sob
 * demanda" acaba dentro do index.html. Medido na origem em 14/11/2026: com o
 * import, o index.html ia de 826 KB para 1.061 KB comprimido - 235 KB a mais
 * para TODO mundo, em toda abertura, inclusive de quem nunca olha a Visao
 * geral. A Central da Dra. Patricia e montada do mesmo jeito.
 *
 * Entao a biblioteca fica em public/vendor/ (copia do pacote, versao 4.7.1),
 * que o site serve como arquivo solto, e entra por <script> so na hora. O
 * pacote continua nas dependencias de desenvolvimento, pelos tipos.
 *
 * Atualizar a versao = copiar de novo node_modules/maplibre-gl/dist/
 * maplibre-gl.js e maplibre-gl.css para public/vendor/.
 */

type Biblioteca = typeof ML
let pedido: Promise<Biblioteca> | null = null

export function carregarMaplibre(): Promise<Biblioteca> {
  if (pedido) return pedido
  const base = `${import.meta.env.BASE_URL}vendor/`
  pedido = new Promise<Biblioteca>((resolver, recusar) => {
    const pronta = () => (window as unknown as { maplibregl?: Biblioteca }).maplibregl
    if (pronta()) return resolver(pronta()!)
    const estilo = document.createElement('link')
    estilo.rel = 'stylesheet'
    estilo.href = `${base}maplibre-gl.css`
    document.head.appendChild(estilo)
    const script = document.createElement('script')
    script.src = `${base}maplibre-gl.js`
    script.async = true
    script.onload = () => (pronta() ? resolver(pronta()!) : recusar(new Error('maplibre-gl carregou sem se registrar')))
    script.onerror = () => recusar(new Error('maplibre-gl nao carregou'))
    document.head.appendChild(script)
  })
  // Falhou uma vez (internet caiu): a proxima tentativa busca de novo, em vez
  // de devolver para sempre a mesma recusa.
  pedido.catch(() => {
    pedido = null
  })
  return pedido
}
