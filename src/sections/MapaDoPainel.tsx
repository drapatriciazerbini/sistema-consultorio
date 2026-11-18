import { useState } from 'react'
import MapaReal from '@/sections/MapaRealDasCidades'
import MapaDasCidades from '@/sections/MapaDasCidades'
import type { CidadeNoMapa } from '@/lib/cidades-no-mapa'

/**
 * Qual mapa o painel "De onde vem quem atendemos" mostra (18/11/2026, porte
 * do sistema de origem, onde entrou em 14/11/2026).
 *
 * Sao dois: o DESENHADO (MapaDasCidades: instantaneo, nao depende de nada) e o
 * REAL (MapaRealDasCidades: ruas e predios de verdade, mas pesado e dependente
 * de internet e de um servico de fora). Na origem o Edu pediu o real "para ver
 * como fica", ja avisado de que ele abre mais devagar, e ficou.
 *
 * Por isso o desenhado nunca sai: ele e o que aparece enquanto o real carrega,
 * e o que fica se o real falhar - com o motivo escrito embaixo, porque quadro
 * cinza sem explicacao e o tipo de falha calada que este projeto nao aceita.
 * O real fica POR CIMA do desenhado, no mesmo retangulo, entao o painel nao
 * pula de tamanho quando ele chega.
 *
 * A escolha entre os dois fica guardada no navegador de cada um.
 */

const CHAVE = 'central.mapa-das-cidades'
type Modo = 'real' | 'desenho'

function modoGuardado(): Modo {
  try {
    return window.localStorage.getItem(CHAVE) === 'desenho' ? 'desenho' : 'real'
  } catch {
    return 'real'
  }
}

export default function MapaDoPainel({ cidades, fora }: { cidades: CidadeNoMapa[]; fora: number }) {
  const [modo, setModo] = useState<Modo>(modoGuardado)
  const [pronto, setPronto] = useState(false)
  const [falha, setFalha] = useState('')

  const escolher = (novo: Modo) => {
    setModo(novo)
    setFalha('')
    setPronto(false)
    try {
      window.localStorage.setItem(CHAVE, novo)
    } catch {
      // Navegador sem armazenamento: a escolha vale so ate fechar a tela.
    }
  }
  // Sem cidade conhecida nao ha o que enquadrar: fica o desenho, com o aviso dele.
  const mostrarReal = modo === 'real' && !falha && cidades.length > 0

  return (
    <div>
      <MapaDasCidades
        cidades={cidades}
        fora={fora}
        sobre={
          mostrarReal ? (
            <div className={`absolute inset-0 transition-opacity duration-500 ${pronto ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <MapaReal cidades={cidades} onPronto={() => setPronto(true)} onFalha={(motivo) => setFalha(motivo)} />
            </div>
          ) : null
        }
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">
        {falha && (
          <span className="rounded-full bg-[#fbf1e6] px-2.5 py-1 font-bold text-[#8a5a1c]">
            Mapa real não carregou ({falha}). Mostrando o desenho.
          </span>
        )}
        {mostrarReal && !pronto && <span>Carregando o mapa real…</span>}
        {mostrarReal && pronto && <span>Arraste para andar · Ctrl + rolagem aproxima · botão direito gira</span>}
        <button
          type="button"
          onClick={() => escolher(modo === 'real' && !falha ? 'desenho' : 'real')}
          className="ml-auto rounded-full border border-[#193d36]/12 bg-white px-2.5 py-1 font-extrabold text-[#33485a] transition hover:border-[#2f7f74]/50 hover:text-[#17564d]"
        >
          {falha ? 'Tentar o mapa real de novo' : modo === 'real' ? 'Ver o mapa desenhado' : 'Ver o mapa real em 3D'}
        </button>
      </div>
    </div>
  )
}
