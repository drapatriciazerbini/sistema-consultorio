import { useEffect, useRef } from 'react'

/**
 * O botao voltar do celular (07/11/2026, do sistema do Dr. Marcello, onde
 * existe desde 15/10/2026).
 *
 * A Central e uma pagina so: abrir um popup nao muda o endereco. Para o
 * Android, entao, nao ha "tela anterior" - o voltar do aparelho, que e o que a
 * mao procura, fechava o sistema inteiro no meio de uma conversa com o
 * paciente, em vez de fechar so a ficha aberta por cima dela.
 *
 * Cada camada aberta (hoje, o cadastro aberto na conversa) deixa um passo no
 * historico do navegador. O voltar do celular consome esse passo e fecha a
 * camada; fechar pela tela (X, Fechar) consome o passo tambem, para o voltar
 * seguinte nao cair num passo vazio. O endereco nao muda: so o estado da
 * entrada, por cima do que o roteador ja guarda nela.
 */

let contador = 0

export function useVoltarDoCelular(aberta: boolean, fechar: () => void) {
  // A funcao muda a cada render; a camada nao pode reabrir por causa disso.
  const fecharAgora = useRef(fechar)
  useEffect(() => {
    fecharAgora.current = fechar
  })

  useEffect(() => {
    if (!aberta) return
    contador += 1
    const marca = `camada-${contador}`
    window.history.pushState({ ...(window.history.state ?? {}), centralCamada: marca }, '')
    let saiuPeloVoltar = false

    const aoVoltar = () => {
      // Saiu so uma camada de cima desta: esta continua aberta.
      if ((window.history.state as { centralCamada?: string } | null)?.centralCamada === marca) return
      saiuPeloVoltar = true
      fecharAgora.current()
    }
    window.addEventListener('popstate', aoVoltar)

    return () => {
      window.removeEventListener('popstate', aoVoltar)
      if (saiuPeloVoltar) return
      // Fechou pela tela: tira o passo que esta camada pos. Depois do que o
      // React fizer neste mesmo instante, e nao ja: se o fechamento trocou de
      // tela e a tela nova anotou um passo por cima, voltar agora levaria de
      // volta para a velha. Nesse caso fica um passo a mais no historico, e so.
      window.setTimeout(() => {
        if ((window.history.state as { centralCamada?: string } | null)?.centralCamada === marca) window.history.back()
      }, 0)
    }
  }, [aberta])
}
