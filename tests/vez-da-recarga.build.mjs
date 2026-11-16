function criarVezDaRecarga(mudarCarregando) {
  let ultima = 0;
  return {
    comecar(silencioso) {
      const minha = ++ultima;
      if (!silencioso) mudarCarregando(true);
      return {
        ehAUltima: () => ultima === minha,
        terminar: () => {
          if (ultima === minha) mudarCarregando(false);
        }
      };
    },
    /** A tela saiu: nenhuma recarga em andamento grava mais nada. */
    descartarTodas() {
      ultima += 1;
    }
  };
}
export {
  criarVezDaRecarga
};
