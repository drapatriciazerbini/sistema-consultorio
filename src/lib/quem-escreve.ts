/**
 * A linha pequena embaixo do nome do paciente, na conversa (porte de
 * 18/11/2026, do sistema do Dr. Marcello, la desde 13/11/2026).
 *
 * O pedido de la: "que tal aparecer o nome do paciente e embaixo, pequeno, o
 * de quem escreve?". Aqui pesa mais ainda: o titulo da conversa e o paciente
 * idoso, mas quem escreve quase sempre e a filha, o filho ou o cuidador, e a
 * equipe quer chamar essa pessoa pelo nome - e saber, antes de responder, se
 * esta falando com a familia ou com o cuidador do turno.
 *
 * Duas fontes, nesta ordem:
 *  1. o numero foi ligado como segundo telefone (patient_phones): vale o
 *     rotulo que a equipe marcou ("Filha", "Cuidador(a)") e o nome que a
 *     pessoa usa no WhatsApp. O acompanhante do cadastro NAO serve aqui: ele e
 *     o dono do outro telefone, e mostrar o nome dele faria a equipe chamar o
 *     cuidador pelo nome da filha.
 *  2. senao, o acompanhante do cadastro.
 * Sem nenhuma das duas, linha vazia: melhor nada do que um palpite.
 *
 * Sem import: o teste roda direto no Node (tests/quem-escreve.test.mjs).
 */

const igual = (a: string, b: string) =>
  a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() ===
  b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

/** Apelido de WhatsApp que nao e nome: so simbolo, emoji, ponto ou numero. */
const pareceNome = (t: string) => /\p{L}{2,}/u.test(t)

export function linhaDeQuemEscreve(dados: {
  /** guardian_name do cadastro: o campo "Acompanhante". */
  acompanhante?: string | null
  /** Rotulo de patient_phones quando a conversa e de um segundo telefone. */
  quemE?: string | null
  nomeNoWhatsApp?: string | null
  nomeDoPaciente?: string | null
}): string {
  const paciente = (dados.nomeDoPaciente ?? '').trim()
  const quemE = (dados.quemE ?? '').trim()
  if (quemE) {
    const apelido = (dados.nomeNoWhatsApp ?? '').trim()
    // O nome do WhatsApp igual ao do paciente nao diz quem e a filha.
    return apelido && pareceNome(apelido) && !igual(apelido, paciente) ? `${quemE}: ${apelido}` : quemE
  }
  const acompanhante = (dados.acompanhante ?? '').trim()
  // Paciente que responde por si (ou cadastro preenchido com o proprio nome):
  // repetir o nome embaixo dele mesmo so ocupa espaco.
  if (!acompanhante || igual(acompanhante, paciente)) return ''
  return `Acompanhante: ${acompanhante}`
}

/** Chave para casar a conversa com a linha de patient_phones: paciente + 8 ultimos digitos. */
export function chaveDoTelefone(patientId: string, digitos: string): string {
  return `${patientId}|${String(digitos ?? '').replace(/\D/g, '').slice(-8)}`
}
