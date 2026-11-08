/**
 * A espera pela Memed ficar pronta, separada do DOM para poder ser testada no
 * Node (tests/memed-carga.test.mjs). memed.ts liga isto ao navegador de verdade.
 *
 * Portado em 07/11/2026 do sistema do Dr. Marcello, onde entrou em 06/11. A
 * Central da Dra. ja reconhecia o quadro da V4 desde 05/11
 * (memed-na-pagina.ts), mas o carregador continuava o antigo: prazo de 40 s
 * que jogava a carga fora, atalho que dava "pronta" antes da hora e nova
 * tentativa que podia por um segundo script na pagina. A historia, como foi
 * la:
 *
 * 06/11/2026, de manha: o Dr. Marcello abriu a Memed pelo adendo e o primeiro
 * clique deu "A Memed nao respondeu a tempo"; o segundo abriu. A primeira
 * leitura foi "carga lenta" e o prazo subiu de 40 s para 2 minutos - e piorou:
 * duas horas depois a espera ia aos 2 minutos e falhava sempre.
 *
 * A causa de verdade: em 28/10/2026 a Memed trocou o script (3.25.0) e passou a
 * escolher, por parceiro, entre a tela antiga e uma nova, a "V4"
 * (flag v4-frontend-b2b-rollout, decidida no navegador, em
 * window.__mdSinapseGate). O sinal de pronta que este sistema usava, o iframe
 * "mdhub-module-plataforma.prescricao", so existe na tela antiga. Na V4 ele
 * nunca aparece, e a espera so terminava no prazo. O segundo clique funcionava
 * por acaso: a versao de entao aceitava "o MdHub existe" sem olhar o iframe.
 *
 * Por isso duas regras aqui:
 *
 *  1. "Pronta" e decidido por quem conhece a Memed (memed.ts, moduloPronto):
 *     na V4 basta o script dela ter carregado, porque o hub da V4 guarda os
 *     comandos ate a tela dela subir; na antiga, o iframe.
 *  2. Rede de seguranca para a proxima troca deles: com o hub ja na pagina ha
 *     LIMITE_SEM_SINAL_MS e nenhum sinal de pronta, segue assim mesmo (e avisa
 *     no console). Os comandos tem prazo proprio (memed.ts, comando) e a tela
 *     abre; esperar mais nao ajuda ninguem.
 *
 * E o que ja valia: um script so na pagina, a carga nunca e descartada, uma
 * nova tentativa volta a esperar o mesmo script. So falha de rede do script
 * (ou a Memed nao se anunciar) tira o script para inserir de novo.
 */

/** Prazo final, sem hub nenhum: a Memed realmente nao veio. */
export const PRAZO_DA_MEMED_MS = 90_000

/** Hub na pagina sem sinal de pronta: segue assim mesmo depois disso. */
export const LIMITE_SEM_SINAL_MS = 15_000

/** O que o script da Memed deixa em window.__mdSinapseGate. */
export type PortaoDaMemed = { phase?: string; v4Ready?: boolean }

/**
 * A Memed aceita comando? (regra 1, acima)
 *
 * V4: basta o script V4 ter carregado (v4Ready); o hub dela guarda os comandos
 * ate a tela subir, e o iframe da tela antiga nunca vai existir. Ainda
 * decidindo ("waiting", "deciding"): nao. Tela antiga, com ou sem portao: o
 * iframe do modulo, como desde 21/09/2026 (o hub sozinho fazia cada comando
 * esperar 8 s ate desistir).
 */
export function memedAceitaComando(portao: PortaoDaMemed | undefined | null, temIframeDaTelaAntiga: boolean): boolean {
  if (portao?.phase === 'v4') return portao.v4Ready === true
  if (portao && portao.phase !== 'legacy') return false
  return temIframeDaTelaAntiga
}

/** O minimo que a espera precisa saber do hub da Memed. */
export type HubMinimo = object

export type AmbienteDaMemed<Hub extends HubMinimo> = {
  /** O script da Memed ja esta na pagina (carregando ou carregado). */
  temScript: () => boolean
  /** Poe o script na pagina. Falha de rede deve chegar por erroDoScript. */
  inserirScript: () => void
  /** O hub da Memed, quando ja existe. */
  hub: () => Hub | undefined
  /** A Memed aceita comando (V4 carregada, ou o iframe da tela antiga). */
  moduloPronto: () => boolean
  /** Erro do script, se a carga dele falhou. */
  erroDoScript: () => Error | null
  /** Ouvintes de receita no hub: o ambiente garante que entram uma vez so. */
  prepararHub: (hub: Hub) => void
  /** Seguiu sem o sinal de pronta (rede de seguranca): so para registrar. */
  semSinal?: () => void
  relogio?: {
    setInterval: (fn: () => void, ms: number) => unknown
    clearInterval: (id: unknown) => void
    setTimeout: (fn: () => void, ms: number) => unknown
    clearTimeout: (id: unknown) => void
    agora: () => number
  }
  prazoMs?: number
  limiteSemSinalMs?: number
}

export function criarEsperaDaMemed<Hub extends HubMinimo>(ambiente: AmbienteDaMemed<Hub>) {
  const relogio = ambiente.relogio ?? {
    setInterval: (fn: () => void, ms: number) => globalThis.setInterval(fn, ms),
    clearInterval: (id: unknown) => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: unknown) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
    agora: () => Date.now(),
  }
  const prazoMs = ambiente.prazoMs ?? PRAZO_DA_MEMED_MS
  const limiteSemSinalMs = ambiente.limiteSemSinalMs ?? LIMITE_SEM_SINAL_MS
  let esperando: Promise<void> | null = null
  // Desde quando o hub esta na pagina sem a Memed dizer que esta pronta. Fica
  // fora da espera: um segundo clique nao zera o tempo que ja passou.
  let hubVistoEm: number | null = null
  // Ja seguiu sem sinal uma vez: dai em diante, hub na pagina basta.
  let seguiuSemSinal = false

  /** Pronta para receber comando. */
  function pronta(): boolean {
    const hub = ambiente.hub()
    if (!hub) return false
    ambiente.prepararHub(hub)
    if (ambiente.moduloPronto()) return true
    if (seguiuSemSinal) return true
    if (hubVistoEm === null) hubVistoEm = relogio.agora()
    if (relogio.agora() - hubVistoEm < limiteSemSinalMs) return false
    seguiuSemSinal = true
    ambiente.semSinal?.()
    return true
  }

  function esperar(): Promise<void> {
    if (esperando) return esperando
    // Uma tentativa nova nunca poe um segundo script: espera o que ja esta la.
    if (!ambiente.temScript()) ambiente.inserirScript()

    esperando = new Promise<void>((resolve, reject) => {
      let intervalo: unknown = null
      let prazo: unknown = null
      const fim = (erro?: Error) => {
        if (intervalo !== null) relogio.clearInterval(intervalo)
        if (prazo !== null) relogio.clearTimeout(prazo)
        if (erro) {
          // So a espera acaba; o script continua carregando e a proxima
          // tentativa aproveita o que ele ja baixou.
          esperando = null
          reject(erro)
        } else {
          resolve()
        }
      }
      const conferir = () => {
        const erro = ambiente.erroDoScript()
        if (erro) return fim(erro)
        if (pronta()) fim()
      }
      // 60 ms: quem clicou logo depois de entrar ganha a diferenca inteira.
      intervalo = relogio.setInterval(conferir, 60)
      prazo = relogio.setTimeout(
        () =>
          fim(
            new Error(
              'A Memed não carregou. Confira a internet e clique em Prescrever de novo; se repetir, atualize a página (Ctrl+F5).',
            ),
          ),
        prazoMs,
      )
      // Sem conferir aqui dentro, na hora: um erro ja presente zeraria
      // "esperando" antes de a promessa ser guardada nele, e a promessa
      // recusada ficaria guardada para sempre. O primeiro intervalo vem em 60 ms.
    })
    return esperando
  }

  return { esperar, pronta }
}
