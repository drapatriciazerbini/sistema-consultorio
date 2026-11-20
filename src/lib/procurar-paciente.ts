/**
 * Achar o paciente pelo nome, para ligar a ele um segundo telefone (porte de
 * 18/11/2026, ver supabase/functions/_shared/telefones-do-paciente.ts).
 *
 * Sem acento e sem ordem fixa: "lima jose" acha "Jose Carlos Lima", com ou sem acento. Tambem
 * procura pelo nome do acompanhante, porque quem atende muitas vezes so sabe o
 * da filha. Menos de 2 letras nao procura: listaria a clinica inteira.
 *
 * Sem import: o teste roda direto no Node (tests/telefones-do-paciente.test.mjs).
 */

const semAcento = (t: string) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export type PacienteParaLigar = { id: string; nome: string; responsavel?: string; telefone?: string }

export function procurarPacientes<T extends PacienteParaLigar>(pacientes: readonly T[], termo: string, limite = 8): T[] {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean)
  if (palavras.join('').length < 2) return []
  const achados = pacientes
    .map((p) => {
      const nome = semAcento(p.nome)
      const tudo = `${nome} ${semAcento(p.responsavel ?? '')}`
      if (!palavras.every((w) => tudo.includes(w))) return null
      // Quem casa pelo proprio nome vem antes de quem casa so pelo
      // acompanhante; e quem comeca pelo termo, antes de quem so o contem.
      const peso = (palavras.every((w) => nome.includes(w)) ? 0 : 2) + (nome.startsWith(palavras[0]) ? 0 : 1)
      return { p, peso }
    })
    .filter((x): x is { p: T; peso: number } => x !== null)
  achados.sort((a, b) => a.peso - b.peso || a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
  return achados.slice(0, limite).map((x) => x.p)
}

/**
 * Quem a equipe esta digitando como "paciente novo" ja tem cadastro? (porte de
 * 20/11/2026 do sistema do Dr. Marcello, onde entrou em 17/11)
 *
 * La, em 16/11, um paciente que ja era da casa foi marcado pelos campos de
 * paciente novo, digitando nome e telefone - e o telefone saiu com um digito
 * trocado. A consulta nasceu solta do cadastro, e no dia seguinte o aviso de
 * cancelamento foi para o WhatsApp de um desconhecido. Alem disso o sistema
 * cria o cadastro sozinho na vespera com o que foi digitado: nome repetido
 * aqui vira cadastro repetido la. Com paciente idoso, em que a filha costuma
 * marcar pelo proprio telefone, o risco e o mesmo.
 *
 * Casa por telefone (os 8 ultimos digitos, para nao depender de 55, DDD e nono
 * digito) ou por nome: todas as palavras digitadas, inteiras, no nome do
 * cadastro. Uma palavra so nao avisa ("Maria" acenderia meia clinica), a menos
 * que seja o nome inteiro do cadastro.
 */
export type JaCadastrado<T> = { paciente: T; motivo: 'nome' | 'telefone' }

export function jaCadastrados<T extends PacienteParaLigar>(
  pacientes: readonly T[],
  nomeDigitado: string,
  telefoneDigitado: string,
  limite = 3,
): JaCadastrado<T>[] {
  const palavras = semAcento(nomeDigitado).split(/[^a-z0-9]+/).filter(Boolean)
  const digitos = String(telefoneDigitado ?? '').replace(/\D/g, '')
  const fim = digitos.length >= 10 ? digitos.slice(-8) : ''
  const achados: JaCadastrado<T>[] = []
  for (const p of pacientes) {
    const doCadastro = semAcento(p.nome).split(/[^a-z0-9]+/).filter(Boolean)
    const mesmoNome =
      palavras.length >= 2
        ? palavras.every((w) => doCadastro.includes(w))
        : palavras.length === 1 && doCadastro.length === 1 && doCadastro[0] === palavras[0]
    const mesmoTelefone = fim !== '' && String(p.telefone ?? '').replace(/\D/g, '').slice(-8) === fim
    if (mesmoNome) achados.push({ paciente: p, motivo: 'nome' })
    else if (mesmoTelefone) achados.push({ paciente: p, motivo: 'telefone' })
  }
  // Nome igual vem antes de telefone igual: marido e mulher dividem o telefone da filha.
  achados.sort((a, b) => (a.motivo === b.motivo ? a.paciente.nome.localeCompare(b.paciente.nome, 'pt-BR') : a.motivo === 'nome' ? -1 : 1))
  return achados.slice(0, limite)
}
