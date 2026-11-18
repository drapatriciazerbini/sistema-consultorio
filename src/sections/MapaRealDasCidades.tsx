import { useEffect, useRef, useState } from 'react'
import type * as ML from 'maplibre-gl'
import { carregarMaplibre } from '@/lib/carregar-maplibre'
import type { CidadeNoMapa } from '@/lib/cidades-no-mapa'

/**
 * O mapa de verdade, inclinado, com uma coluna por cidade (18/11/2026, porte
 * do sistema de origem, onde entrou em 14/11/2026).
 *
 * La o Edu mandou o print de um mapa de site (ruas, mar, predios em 3D),
 * perguntou "nao daria para fazer assim?" e aprovou a proposta. Veio para a
 * Central da Dra. Patricia igual, so com as cores dela.
 *
 * A biblioteca do mapa tem perto de 230 KB e NAO entra no site: e buscada a
 * parte, na hora, por carregar-maplibre.ts (la esta o porque e a medida).
 *
 * As ruas vem de fora, do OpenFreeMap (gratuito, sem chave, sem cadastro). O
 * servico so recebe o pedido "desenho desta regiao": nenhum dado de paciente
 * sai daqui. Como depende de internet e de terceiro, ele pode falhar - e ai
 * NAO fica um quadro cinza calado: avisa quem chamou (onFalha), que volta para
 * o mapa desenhado e diz na tela por que.
 */

const ESTILO = 'https://tiles.openfreemap.org/styles/positron'
// Se o servico nem respondeu nesse tempo, nao vai responder: melhor o desenho.
// O relogio para quando o ESTILO chega, e nao quando o mapa termina de se
// desenhar: num computador lento o desenho passa de 12 s com o servico no ar
// (aconteceu no teste de 14/11/2026, na origem), e desistir ali seria falha falsa.
const ESPERA_MAXIMA_MS = 15000
const INCLINACAO = 58
const GIRO = -22

/** Uma coluna = um circulo de uns 900 m de raio que o mapa levanta. */
function coluna(c: CidadeNoMapa, maior: number) {
  const raio = 0.0085
  const pontos: [number, number][] = []
  for (let k = 0; k <= 28; k++) {
    const a = (k / 28) * Math.PI * 2
    pontos.push([c.lon + (Math.cos(a) * raio) / Math.cos((c.lat * Math.PI) / 180), c.lat + Math.sin(a) * raio])
  }
  return {
    type: 'Feature' as const,
    properties: { nome: c.nome, n: c.n, h: 1400 + 6500 * (c.n / maior) },
    geometry: { type: 'Polygon' as const, coordinates: [pontos] },
  }
}

export default function MapaRealDasCidades({
  cidades,
  onPronto,
  onFalha,
}: {
  cidades: CidadeNoMapa[]
  onPronto: () => void
  onFalha: (motivo: string) => void
}) {
  const caixa = useRef<HTMLDivElement>(null)
  // Os avisos mudam de identidade a cada desenho de quem chama; guardados aqui
  // para o mapa nao ser destruido e refeito por causa disso.
  const avisos = useRef({ onPronto, onFalha })
  useEffect(() => {
    avisos.current = { onPronto, onFalha }
  })
  const [biblioteca, setBiblioteca] = useState<typeof ML | null>(null)
  useEffect(() => {
    let vivo = true
    carregarMaplibre().then(
      (lib) => vivo && setBiblioteca(() => lib),
      (erro) => {
        console.warn('A biblioteca do mapa real nao carregou', erro)
        if (vivo) avisos.current.onFalha('a biblioteca do mapa não carregou')
      },
    )
    return () => {
      vivo = false
    }
  }, [])
  // O mapa so e refeito quando as contagens mudam de verdade.
  const assinatura = cidades.map((c) => `${c.chave}:${c.n}`).join('|')

  useEffect(() => {
    if (!caixa.current || cidades.length === 0 || !biblioteca) return
    const maplibregl = biblioteca
    let vivo = true
    let pronto = false
    let mapa: ML.Map
    const maior = Math.max(...cidades.map((c) => c.n), 1)
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const limites = new maplibregl.LngLatBounds()
    for (const c of cidades) limites.extend([c.lon, c.lat])
    const falhar = (motivo: string) => {
      if (!vivo || pronto) return
      vivo = false
      avisos.current.onFalha(motivo)
    }

    try {
      mapa = new maplibregl.Map({
        container: caixa.current,
        style: ESTILO,
        bounds: limites,
        fitBoundsOptions: { padding: 60, maxZoom: 10 },
        // A rolagem da pagina nao pode ficar presa dentro do mapa.
        cooperativeGestures: true,
        attributionControl: { compact: true },
        locale: {
          'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + rolagem para aproximar o mapa',
          'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + rolagem para aproximar o mapa',
          'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
          'NavigationControl.ZoomIn': 'Aproximar',
          'NavigationControl.ZoomOut': 'Afastar',
          'NavigationControl.ResetBearing': 'Voltar o norte para cima',
        },
      })
    } catch (erro) {
      // Sem WebGL (computador antigo, aceleracao desligada) o construtor estoura.
      console.warn('Mapa real nao abriu neste navegador', erro)
      falhar('este navegador não abre mapa 3D')
      return
    }
    const relogio = window.setTimeout(() => falhar('o serviço de mapas não respondeu'), ESPERA_MAXIMA_MS)
    // Erro ANTES de carregar e falta do estilo: sem ele nao ha mapa. Depois de
    // carregado, um quadradinho que falha nao derruba o resto.
    mapa.on('error', (e) => {
      console.warn('Mapa real:', e?.error?.message ?? e)
      if (!pronto && !mapa.isStyleLoaded()) falhar('o serviço de mapas não respondeu')
    })
    mapa.once('styledata', () => window.clearTimeout(relogio))
    mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    const balao = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'mapa-real-balao' })
    let quadro = 0

    mapa.on('load', () => {
      if (!vivo) return
      window.clearTimeout(relogio)
      // Mar azul: o estilo original e todo cinza.
      for (const camada of mapa.getStyle().layers ?? []) {
        if (camada.type === 'fill' && /water/.test(camada.id)) mapa.setPaintProperty(camada.id, 'fill-color', '#bdd4e2')
      }
      // Predios em 3D, so de perto.
      if (mapa.getSource('openmaptiles')) {
        mapa.addLayer({
          id: 'predios-3d',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': '#cfd6d8',
            'fill-extrusion-opacity': 0.9,
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          },
        })
      }
      mapa.addSource('cidades', { type: 'geojson', data: { type: 'FeatureCollection', features: cidades.map((c) => coluna(c, maior)) } })
      mapa.addLayer({
        id: 'colunas',
        type: 'fill-extrusion',
        source: 'cidades',
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'n'], 1, '#8fbcae', Math.max(2, maior), '#4f8576'],
          'fill-extrusion-height': parado ? ['get', 'h'] : 0,
          // De perto a coluna some: com 900 m de raio, cobriria a cidade inteira.
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 11.6, 0.92, 12.8, 0],
          'fill-extrusion-vertical-gradient': true,
        },
      })
      mapa.addSource('nomes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: cidades.map((c) => ({
            type: 'Feature' as const,
            properties: { nome: c.nome, n: String(c.n), ordem: -c.n },
            geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
          })),
        },
      })
      // No lugar da coluna, de perto, um ponto.
      mapa.addLayer({ id: 'ponto-halo', type: 'circle', source: 'nomes', minzoom: 12.3, paint: { 'circle-radius': 20, 'circle-color': '#2f7f74', 'circle-opacity': 0.18 } })
      mapa.addLayer({ id: 'ponto', type: 'circle', source: 'nomes', minzoom: 12.3, paint: { 'circle-radius': 9, 'circle-color': '#2f7f74', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } })
      mapa.addLayer({
        id: 'nomes',
        type: 'symbol',
        source: 'nomes',
        layout: {
          'text-field': ['format', ['get', 'n'], { 'font-scale': 1.25 }, '  ', {}, ['get', 'nome'], { 'font-scale': 0.9 }],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-variable-anchor': ['top', 'left', 'right', 'bottom'],
          'text-radial-offset': 1.1,
          // Quando dois nomes batem, fica o da cidade com mais pacientes.
          'symbol-sort-key': ['get', 'ordem'],
        },
        paint: { 'text-color': '#193d36', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      })

      // Chegada: a camera inclina e as colunas sobem, uma vez so.
      // O enquadre e calculado com o mapa deitado e depois acertado a olho:
      // pedir ao mapa para enquadrar ja inclinado (fitBounds com pitch) deixava
      // tudo longe demais, com as colunas do tamanho de um palito.
      const deitado = mapa.cameraForBounds(limites, { padding: 40, maxZoom: 10.2 })
      const meio = limites.getCenter()
      const enquadre = {
        // Um pouco ao norte do meio: inclinado, o mapa mostra mais o fundo.
        center: [meio.lng, meio.lat + 0.035] as [number, number],
        zoom: Math.min(10.4, (deitado?.zoom ?? 9.2) + 0.08),
        pitch: INCLINACAO,
        bearing: GIRO,
      }
      if (parado) mapa.jumpTo(enquadre)
      else {
        mapa.flyTo({ ...enquadre, duration: 2200, essential: true })
        const comeco = performance.now() + 900
        const subir = (agora: number) => {
          if (!vivo) return
          const k = Math.max(0, Math.min(1, (agora - comeco) / 1100))
          mapa.setPaintProperty('colunas', 'fill-extrusion-height', ['*', ['get', 'h'], 1 - Math.pow(1 - k, 3)])
          if (k < 1) quadro = requestAnimationFrame(subir)
        }
        quadro = requestAnimationFrame(subir)
      }
      pronto = true
      avisos.current.onPronto()
    })

    mapa.on('mousemove', 'colunas', (e) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      mapa.getCanvas().style.cursor = 'pointer'
      // Texto, e nao HTML: o nome da cidade vem do cadastro, digitado a mao.
      balao.setLngLat(e.lngLat).setText(`${p.nome}: ${p.n} ${Number(p.n) === 1 ? 'paciente' : 'pacientes'}`).addTo(mapa)
    })
    mapa.on('mouseleave', 'colunas', () => {
      mapa.getCanvas().style.cursor = ''
      balao.remove()
    })

    return () => {
      vivo = false
      window.clearTimeout(relogio)
      cancelAnimationFrame(quadro)
      mapa.remove()
    }
    // `cidades` entra pela assinatura: a lista e refeita a cada desenho do painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, biblioteca])

  return (
    <>
      <style>{`
        .mapa-real-balao .maplibregl-popup-content { border-radius: 999px; background: #0d1b26; color: #fff; font-weight: 800; font-size: 12px; padding: 6px 13px; box-shadow: 0 6px 18px rgba(0,0,0,.25) }
        .mapa-real-balao.maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: #0d1b26 }
        .mapa-real-balao.maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: #0d1b26 }
        /* 14/11/2026: o Edu pediu para sumir o aviso escuro "Use Ctrl + rolagem"
           que cobria o mapa a cada rolagem da pagina. O comportamento fica (a
           rolagem continua passando direto e o Ctrl aproxima); a instrucao ja
           esta escrita na linha embaixo do mapa. */
        .mapa-real .maplibregl-cooperative-gesture-screen { display: none !important }
      `}</style>
      <div ref={caixa} className="mapa-real h-full w-full" />
    </>
  )
}
