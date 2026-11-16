/**
 * Quem desliga o "Carregando dados da clinica" (11/11/2026).
 *
 * O caso: o Edu restaurou a Marina em Arquivados e a tela ficou carregando ate
 * o F5, duas vezes seguidas. O banco tinha restaurado as duas (15h50 e 15h51);
 * so a tela ficou presa. Restaurar recarrega a base com a tela de carregando, e
 * a mesma mudanca em patients dispara, um segundo depois, a recarga silenciosa
 * do tempo real. A base demora mais que um segundo para vir: a silenciosa passa
 * a ser a ultima, a primeira termina e descarta o resultado (certo) sem
 * desligar o carregando (errado), e a silenciosa nao desligava porque "nao era
 * dela". Ninguem desligava.
 *
 * A regra agora: so a ultima recarga vale, e a ultima desliga o carregando ao
 * terminar, seja silenciosa ou nao. Silenciosa nunca liga.
 */
export type VezDaRecarga = {
  /** Esta recarga ainda e a ultima pedida (o resultado dela vale). */
  ehAUltima: () => boolean
  /** Fim da recarga, com sucesso ou erro. */
  terminar: () => void
}

export function criarVezDaRecarga(mudarCarregando: (carregando: boolean) => void) {
  let ultima = 0
  return {
    comecar(silencioso: boolean): VezDaRecarga {
      const minha = ++ultima
      if (!silencioso) mudarCarregando(true)
      return {
        ehAUltima: () => ultima === minha,
        terminar: () => {
          if (ultima === minha) mudarCarregando(false)
        },
      }
    },
    /** A tela saiu: nenhuma recarga em andamento grava mais nada. */
    descartarTodas() {
      ultima += 1
    },
  }
}
