/**
 * Mais de um telefone no mesmo cadastro (porte de 18/11/2026, do sistema do
 * Dr. Marcello, la desde 13/11/2026).
 *
 * O caso de la: uma pessoa da familia marcou a consulta pelo celular dela, e
 * outra escrevia de outro numero para mandar exame e tirar duvida. O cadastro
 * so tinha um telefone, entao a segunda aparecia como "Contato sem cadastro":
 * o robo oferecia cadastrar de novo, o questionario nao sabia de quem era e o
 * exame ficava fora do historico do paciente.
 *
 * Aqui isso e o dia a dia: o cadastro tem o celular do proprio idoso (ou de
 * uma filha), e quem escreve e outro filho, o conjuge ou o cuidador do turno,
 * cada um do seu numero.
 *
 * O telefone do cadastro continua um so, e e nele que saem lembrete e
 * acompanhamento. Os outros ficam em patient_phones: servem para RECONHECER
 * quem escreve e ligar a conversa ao mesmo paciente. Quem liga e a equipe,
 * pelo botao da conversa - o robo nunca liga sozinho um numero a um paciente.
 *
 * Tabela nova: a busca dela fica a parte, em try/catch. Sem ela (a funcao sobe
 * antes da migration), o numero volta a ser "sem cadastro", como era, e o log
 * diz por que.
 */

type Admin = { from: (tabela: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * De quem e o numero, para a equipe escolher ao ligar. E o rotulo que aparece
 * embaixo do nome do paciente na conversa (ver src/lib/quem-escreve.ts).
 */
export const QUEM_E_O_TELEFONE = ['Filha', 'Filho', 'Esposa ou marido', 'Cuidador(a)', 'Outro familiar', 'O próprio paciente'] as const

/** Junta os do telefone principal com os dos outros telefones, sem repetir, os principais primeiro. */
export function juntarPacientes<T extends { id: string }>(doTelefone: readonly T[], dosOutros: readonly T[]): T[] {
  const vistos = new Set<string>()
  const todos: T[] = []
  for (const p of [...doTelefone, ...dosOutros]) {
    if (!p?.id || vistos.has(p.id)) continue
    vistos.add(p.id)
    todos.push(p)
  }
  return todos
}

/** Os pacientes que tem este numero como segundo telefone. Erro ou tabela ausente: nenhum. */
export async function idsPorOutroTelefone(admin: Admin, clinicId: string, grafias: readonly string[]): Promise<string[]> {
  if (!grafias.length) return []
  try {
    const { data, error } = await admin.from('patient_phones').select('patient_id').eq('clinic_id', clinicId).in('digits', [...grafias]).limit(50)
    if (error) throw error
    return [...new Set(((data ?? []) as { patient_id: string }[]).map((l) => l.patient_id).filter(Boolean))]
  } catch (erro) {
    console.warn('Sem patient_phones; o numero so e reconhecido pelo telefone principal do cadastro', erro)
    return []
  }
}

/**
 * Todos os pacientes deste numero: os que o tem no cadastro e os que o tem
 * como segundo telefone. `idsDosOutros` sao os que so entraram pelo segundo
 * telefone - quem chama usa para achar as consultas deles, que foram marcadas
 * com o telefone de outra pessoa.
 */
export async function pacientesDoTelefone<T extends { id: string }>(
  admin: Admin,
  clinicId: string,
  grafias: readonly string[],
  colunas: string,
): Promise<{ pacientes: T[]; idsDosOutros: string[] }> {
  const { data: doTelefone, error } = await admin
    .from('patients')
    .select(colunas)
    .eq('clinic_id', clinicId)
    .is('archived_at', null)
    .in('phone_digits', [...grafias])
    .order('name')
    // Teto de seguranca: nenhum telefone de familia tem 50 cadastros.
    .limit(50)
  if (error) console.warn('Nao consegui procurar o paciente pelo telefone do cadastro', error)
  const principais = (doTelefone ?? []) as T[]

  const jaAchados = new Set(principais.map((p) => p.id))
  const ids = (await idsPorOutroTelefone(admin, clinicId, grafias)).filter((id) => !jaAchados.has(id))
  if (!ids.length) return { pacientes: principais, idsDosOutros: [] }

  try {
    const { data, error: erroDosOutros } = await admin
      .from('patients')
      .select(colunas)
      .eq('clinic_id', clinicId)
      .is('archived_at', null)
      .in('id', ids)
      .order('name')
      .limit(50)
    if (erroDosOutros) throw erroDosOutros
    const outros = (data ?? []) as T[]
    return { pacientes: juntarPacientes(principais, outros), idsDosOutros: outros.map((p) => p.id) }
  } catch (erro) {
    console.warn('Segundo telefone achado, mas nao li o cadastro dele', erro)
    return { pacientes: principais, idsDosOutros: [] }
  }
}

/**
 * O filtro das consultas futuras de quem escreve. Pelo telefone de quem marcou,
 * como sempre; e, para quem entrou pelo segundo telefone, tambem as do
 * paciente - senao o filho nao ve o que a irma marcou para o pai. Nulo quando
 * basta o telefone (o caminho de antes, sem mudar nada).
 */
export function filtroDasConsultas(grafias: readonly string[], idsDosOutros: readonly string[]): string | null {
  const ids = idsDosOutros.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  const numeros = grafias.filter((g) => /^\d+$/.test(g))
  if (!ids.length || !numeros.length) return null
  return `contact_phone.in.(${numeros.join(',')}),patient_id.in.(${ids.join(',')})`
}
