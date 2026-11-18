import type { ReactNode } from 'react'
import type { CidadeNoMapa } from '@/lib/cidades-no-mapa'

/**
 * Mapa em relevo das cidades dos pacientes (18/11/2026, porte do sistema de
 * origem, onde entrou em 13/11/2026).
 *
 * La o Edu pediu um mapa "cinematografico ou 3D, sem ficar pesado", viu tres
 * propostas e uma cena 3D de verdade e ficou com esta, a mais calma: o litoral
 * da Baixada inclinado, com uma coluna por cidade. Pediu tambem que coubesse
 * no espaco que o painel ja tinha - por isso o recorte largo e baixo (ver
 * ALTURA_DO_RECORTE). Serve igual aqui: o consultorio fica no Gonzaga e as
 * visitas domiciliares sao em Santos e Sao Vicente, o miolo deste desenho.
 *
 * E um SVG desenhado aqui mesmo: sem biblioteca de mapa, sem imagem, sem
 * internet. O litoral e esquematico (serve para situar, nao para medir), e o
 * mapa so conhece as cidades de cidades-no-mapa.ts; as outras aparecem na
 * linha "Outras cidades", para ninguem sumir da conta.
 *
 * As colunas crescem uma vez ao abrir e param: movimento continuo num painel
 * que fica aberto o dia todo cansa.
 */

const COSTA: [number, number][] = [
  [-47.15, -24.46], [-47.02, -24.36], [-46.9, -24.27], [-46.78, -24.2], [-46.62, -24.12], [-46.5, -24.07],
  [-46.41, -24.04], [-46.385, -24.005], [-46.35, -23.99], [-46.31, -23.995], [-46.29, -24.025], [-46.22, -24.025],
  [-46.17, -23.97], [-46.13, -23.9], [-46.1, -23.86], [-46.0, -23.8], [-45.95, -23.78],
]
const SERRA: [number, number][] = [
  [-47.15, -24.22], [-46.95, -24.1], [-46.75, -24.02], [-46.58, -23.93], [-46.45, -23.85], [-46.3, -23.82],
  [-46.15, -23.76], [-45.95, -23.68],
]

type Ponto = [number, number]
// Do grau para a tela: primeiro o mapa plano, depois a inclinacao (o eixo
// norte-sul encolhe, e e isso que da a sensacao de olhar de cima e de lado).
const tela = (lon: number, lat: number, descer = 0): Ponto => [(lon + 47.15) * 512, 160 + (-23.42 - lat) * 560 * 0.52 + descer]

/** Curva suave passando pelo meio de cada trecho. */
function curva(pts: Ponto[]): string {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
  }
  const fim = pts[pts.length - 1]
  return `${d} L${fim[0].toFixed(1)},${fim[1].toFixed(1)}`
}
const terra = (descer: number) => `${curva(COSTA.map(([lo, la]) => tela(lo, la, descer)))} L660,-60 L-40,-60 Z`
const TERRA = terra(0)
const BARRANCO = terra(11)
const LINHA_DA_SERRA = curva(SERRA.map(([lo, la]) => tela(lo, la)))

const ALTURA_MINIMA = 12
const ALTURA_MAXIMA = 90
// Altura do recorte (13/11/2026, na origem). Nasceu com 348 e o Edu, vendo com
// os dados reais, achou comprido: "reduzir uns 30%". Sem paciente em Sao Paulo, o terco
// de cima era planalto vazio. Agora o recorte e baixo e ACOMPANHA as colunas:
// sobe ou desce para enquadrar as cidades que existem, e so cresce se elas nao
// couberem (Sao Paulo e Peruibe ao mesmo tempo, por exemplo).
const ALTURA_DO_RECORTE = 244

export default function MapaDasCidades({
  cidades,
  fora,
  sobre,
}: {
  cidades: CidadeNoMapa[]
  fora: number
  /** O que vai POR CIMA do desenho, no mesmo retangulo (o mapa real, 14/11/2026). */
  sobre?: ReactNode
}) {
  const maior = Math.max(...cidades.map((c) => c.n), 1)
  // Do fundo para a frente: a coluna de baixo no mapa cobre a de cima, como
  // cobriria de verdade.
  const colunas = cidades
    .map((c) => {
      const [x, y] = tela(c.lon, c.lat)
      return { ...c, x, y, h: ALTURA_MINIMA + (ALTURA_MAXIMA - ALTURA_MINIMA) * (c.n / maior) }
    })
    .sort((a, b) => a.y - b.y)

  // Do numero em cima da coluna mais alta ate o nome mais baixo.
  const topo = colunas.length ? Math.min(...colunas.map((c) => c.y - c.h - 22)) : 200
  const pe = colunas.length ? Math.max(...colunas.map((c) => Math.max(c.y + 8, c.y + c.rotulo[1] + 6))) : 400
  const alto = Math.max(ALTURA_DO_RECORTE, pe - topo + 16)
  // Centralizado nas colunas, sem passar do alto da terra desenhada.
  const y0 = Math.max(-40, topo - (alto - (pe - topo)) / 2)

  return (
    <div>
      {/* Em tela estreita o mapa nao encolhe ate o nome ficar ilegivel: rola de lado. */}
      <div className="relative overflow-x-auto rounded-[18px]">
        <svg
          viewBox={`40 ${y0.toFixed(1)} 580 ${alto.toFixed(1)}`}
          role="img"
          aria-label={`Mapa da Baixada Santista e de São Paulo com ${cidades.length} cidades de pacientes`}
          className="block w-full min-w-[460px] rounded-[18px]"
          style={{ background: 'linear-gradient(180deg,#e6eef3 0%,#dbe7ee 100%)' }}
        >
          <defs>
            <linearGradient id="mapa-terra" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6f3ea" />
              <stop offset="1" stopColor="#e4eadf" />
            </linearGradient>
            <linearGradient id="mapa-coluna" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7fb0a3" />
              <stop offset=".55" stopColor="#6f9d91" />
              <stop offset="1" stopColor="#4f7d71" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes mapa-sobe { from { transform: scaleY(0) } to { transform: scaleY(1) } }
            .mapa-coluna { transform-box: fill-box; transform-origin: 50% 100%; animation: mapa-sobe .9s cubic-bezier(.2,.9,.25,1) both }
            @media (prefers-reduced-motion: reduce) { .mapa-coluna { animation: none } }
          `}</style>

          <path d={BARRANCO} fill="#b9c8bd" />
          <path d={TERRA} fill="url(#mapa-terra)" stroke="#fff" strokeWidth="1.5" />
          <path d={LINHA_DA_SERRA} fill="none" stroke="#c9d3c4" strokeWidth="10" strokeLinecap="round" opacity=".55" />
          <path d={LINHA_DA_SERRA} fill="none" stroke="#aebca9" strokeWidth="1.2" strokeDasharray="2 5" />
          <text x="118" y="345" fontSize="9.5" fontWeight="700" fill="#9aa894" letterSpacing="2" transform="rotate(-12.6 118 345)">
            SERRA DO MAR
          </text>
          <text x="436" y={y0 + alto - 14} fontSize="10" fontWeight="700" fill="#9fb4c0" letterSpacing="3">
            OCEANO ATLÂNTICO
          </text>

          {colunas.map((c, i) => (
            <g key={c.chave}>
              <title>{`${c.nome}: ${c.n} ${c.n === 1 ? 'paciente' : 'pacientes'}`}</title>
              <ellipse cx={c.x + 5} cy={c.y + 2} rx="12" ry="4.5" fill="#193d36" opacity=".12" />
              <g className="mapa-coluna" style={{ animationDelay: `${i * 0.08}s` }}>
                <rect x={c.x - 8} y={c.y - c.h} width="16" height={c.h} fill="url(#mapa-coluna)" />
                <ellipse cx={c.x} cy={c.y} rx="8" ry="3.4" fill="#4f7d71" />
                <ellipse cx={c.x} cy={c.y - c.h} rx="8" ry="3.4" fill="#a9cfc4" />
              </g>
              <text x={c.x} y={c.y - c.h - 8} textAnchor="middle" fontSize="13.5" fontWeight="800" fill="#193d36">
                {c.n}
              </text>
            </g>
          ))}
          {/* Os nomes por ultimo, por cima de todas as colunas. */}
          {colunas.map((c) => (
            <text
              key={c.chave}
              x={c.x + c.rotulo[0]}
              y={c.y + c.rotulo[1]}
              textAnchor={c.rotulo[2]}
              fontSize="11"
              fontWeight="700"
              fill="#33485a"
              stroke="#ffffff"
              strokeOpacity=".85"
              strokeWidth="3"
              style={{ paintOrder: 'stroke' }}
            >
              {c.nome}
            </text>
          ))}
        </svg>
        {sobre}
      </div>
      {cidades.length === 0 && (
        <p className="mt-2 text-center text-[11px] text-slate-400">Nenhum paciente com cidade do litoral ou de São Paulo no cadastro.</p>
      )}
      {fora > 0 && (
        <p className="mt-2 text-[10px] font-semibold text-slate-400">
          Outras cidades, fora deste mapa: {fora} {fora === 1 ? 'paciente' : 'pacientes'}. Elas continuam na lista ao lado.
        </p>
      )}
    </div>
  )
}
