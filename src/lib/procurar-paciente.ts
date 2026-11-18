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
