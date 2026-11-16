/**
 * Segunda via da receita: reabrir na Memed a que ja foi emitida (portado em
 * 16/11/2026 do sistema do Dr. Marcello, onde entrou em 13/11; a historia
 * abaixo e de la).
 *
 * Pergunta do Edu: "como o Marcello faz para entrar na Memed e emitir uma 2a
 * via de algo que ele prescreveu? precisa fazer novo adendo?". Nao havia como.
 * O cartao de "Receitas emitidas" tinha um link "Abrir receita" que nunca
 * apareceu: ele dependia de um endereco no aviso da Memed (prescricaoImpressa),
 * e esse aviso so traz o numero da receita e os itens. Conferido no banco: de
 * setembro a novembro, nenhuma receita guardou link.
 *
 * O que sempre foi guardado e o numero (memed_id), e a Memed tem um comando
 * para reabrir a receita por ele, "para reimpressao e edicao" (viewPrescription).
 * E o que o botao "Reimprimir na Memed" usa. Sem adendo: adendo e para o que
 * muda o registro, e segunda via nao muda nada.
 *
 * O risco e a mesma tela deixar editar. Se a Memed devolver um numero
 * diferente do que foi aberto, saiu uma receita NOVA, e o medico precisa
 * saber - ainda mais em atendimento assinado, onde ela fica fora do texto.
 */

/** O numero da receita no que a Memed devolveu ao imprimir. Nulo: nao veio. */
export function idDaReceitaEmitida(dados: unknown): string | null {
  const pacote = (dados ?? {}) as { prescricao?: { id?: unknown }; id?: unknown }
  const id = pacote.prescricao?.id ?? pacote.id
  if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  if (typeof id === 'string' && id.trim()) return id.trim()
  return null
}

/** O numero que vai para a Memed: so digitos, como ela devolveu. Nulo: nao da para reabrir. */
export function idParaReabrir(memedId: string | null | undefined): string | null {
  const id = String(memedId ?? '').trim()
  return /^\d{1,20}$/.test(id) ? id : null
}

export type AvisoDaReimpressao = { tipo: 'ok' | 'info'; texto: string }

/** O que dizer ao medico depois que a Memed imprimiu a partir de uma receita antiga. */
export function avisoDaReimpressao(originalId: string, dados: unknown, assinado: boolean): AvisoDaReimpressao {
  const emitida = idDaReceitaEmitida(dados)
  if (emitida && emitida !== originalId) {
    return {
      tipo: 'info',
      texto: assinado
        ? 'A Memed gerou uma receita NOVA a partir da antiga (houve alteração). Ela está em "Receitas emitidas", mas fora do texto assinado: registre um adendo para ela constar no atendimento.'
        : 'A Memed gerou uma receita NOVA a partir da antiga (houve alteração). Ela está em "Receitas emitidas"; confira se o campo Prescrição do atendimento diz o mesmo.',
    }
  }
  return { tipo: 'ok', texto: 'Segunda via impressa. A receita é a mesma: nada mudou no prontuário.' }
}
