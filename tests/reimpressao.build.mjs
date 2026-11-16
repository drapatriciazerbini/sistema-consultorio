function idDaReceitaEmitida(dados) {
  const pacote = dados ?? {};
  const id = pacote.prescricao?.id ?? pacote.id;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  if (typeof id === "string" && id.trim()) return id.trim();
  return null;
}
function idParaReabrir(memedId) {
  const id = String(memedId ?? "").trim();
  return /^\d{1,20}$/.test(id) ? id : null;
}
function avisoDaReimpressao(originalId, dados, assinado) {
  const emitida = idDaReceitaEmitida(dados);
  if (emitida && emitida !== originalId) {
    return {
      tipo: "info",
      texto: assinado ? 'A Memed gerou uma receita NOVA a partir da antiga (houve altera\xE7\xE3o). Ela est\xE1 em "Receitas emitidas", mas fora do texto assinado: registre um adendo para ela constar no atendimento.' : 'A Memed gerou uma receita NOVA a partir da antiga (houve altera\xE7\xE3o). Ela est\xE1 em "Receitas emitidas"; confira se o campo Prescri\xE7\xE3o do atendimento diz o mesmo.'
    };
  }
  return { tipo: "ok", texto: "Segunda via impressa. A receita \xE9 a mesma: nada mudou no prontu\xE1rio." };
}
export {
  avisoDaReimpressao,
  idDaReceitaEmitida,
  idParaReabrir
};
