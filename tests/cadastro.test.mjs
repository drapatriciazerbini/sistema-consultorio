// Cadastro automatico a partir da ficha do WhatsApp (_shared/cadastro.ts).
// Porte do sistema do Dr. Marcello, adaptado a pacientes adultos e idosos.
//
// 18/10/2026: sem o nome do paciente na ficha, o cadastro nasce com o nome do
// contato (aqui quase sempre a filha ou o cuidador) e marcado, para o
// prontuario e a lista mostrarem "Nome a confirmar".
//
// 25/10/2026: paciente ja conhecido vira vinculo, nao cadastro novo - pelo
// telefone em qualquer grafia (com e sem 55) ou pelo nome sem acento com a
// mesma data de nascimento. Na origem, cinco pacientes tinham cadastro
// repetido.
//
// Dados inventados: o repositorio e publico.
import { cadastrarDaFicha, mesmaPessoa } from './cadastro.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

/** Paciente ja gravado, como o banco devolve (phone_digits e coluna gerada). */
const paciente = (campos) => ({
  clinic_id: 'clinica',
  archived_at: null,
  whatsapp_opt_out_at: null,
  birth_date: null,
  notes: '',
  ...campos,
  phone_digits: String(campos.phone ?? '').replace(/\D/g, ''),
})

/** Banco falso: filtra os pacientes de verdade e guarda o que foi gravado. */
function bancoFalso({ semColunaNova = false, codigoDaColuna = '42703', pacientes = [], falhaNoTelefone = false } = {}) {
  const inseridos = []
  const tentativas = []
  const vinculos = []
  const notas = []
  const consulta = () => {
    const filtros = []
    let peloTelefone = false
    const c = {
      eq: (coluna, valor) => (filtros.push((p) => p[coluna] === valor), c),
      in: (coluna, valores) => ((peloTelefone = true), filtros.push((p) => valores.includes(p[coluna])), c),
      is: (coluna, valor) => (filtros.push((p) => (p[coluna] ?? null) === valor), c),
      order: () => c,
      limit: async () =>
        falhaNoTelefone && peloTelefone
          ? { data: null, error: { message: 'canceling statement due to statement timeout' } }
          : { data: pacientes.filter((p) => filtros.every((f) => f(p))), error: null },
    }
    return c
  }
  const admin = {
    from(tabela) {
      if (tabela === 'patients') {
        return {
          select: () => consulta(),
          insert: (linha) => ({
            select: () => ({
              maybeSingle: async () => {
                tentativas.push({ ...linha })
                if (semColunaNova && 'name_from_contact_at' in linha) {
                  return { data: null, error: { code: codigoDaColuna, message: 'column name_from_contact_at does not exist' } }
                }
                inseridos.push({ ...linha })
                return { data: { id: 'p1', name: linha.name, phone: linha.phone, whatsapp_opt_out_at: null }, error: null }
              },
            }),
          }),
          update: (campos) => ({
            eq: async (_coluna, id) => {
              notas.push({ id, ...campos })
              return { error: null }
            },
          }),
        }
      }
      if (tabela === 'appointments') {
        return {
          update: (campos) => ({
            eq: async (_coluna, id) => {
              vinculos.push({ consulta: id, ...campos })
              return { error: null }
            },
          }),
        }
      }
      throw new Error('tabela nao prevista: ' + tabela)
    },
  }
  return { admin, inseridos, tentativas, vinculos, notas }
}

const consulta = (extra = {}) => ({
  id: 'c1',
  starts_at: '2026-10-21T17:00:00Z',
  contact_name: 'Fernanda Souza',
  contact_phone: '5513999999999',
  intake_patient_name: '',
  intake_birth_date: '03/02/1948',
  clinic_units: { name: 'Consultório (Gonzaga)' },
  ...extra,
})

// --- Nome a confirmar (18/10/2026) ---

{
  // A filha escreveu e a ficha ficou sem o nome do paciente.
  const b = bancoFalso()
  const criado = await cadastrarDaFicha(b.admin, 'clinica', consulta())
  const linha = b.inseridos[0] ?? {}
  confere('sem nome na ficha: cadastro criado com o nome do contato', criado?.name === 'Fernanda Souza', JSON.stringify(criado))
  confere('sem nome na ficha: marcado como nome do contato', Boolean(linha.name_from_contact_at), JSON.stringify(linha))
  confere('sem nome na ficha: aviso tambem nas observacoes', /do contato do WhatsApp/.test(String(linha.notes)), String(linha.notes))
}
{
  const b = bancoFalso()
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'Helena Souza Lima' }))
  const linha = b.inseridos[0] ?? {}
  confere('nome na ficha: sem a marca', linha.name === 'Helena Souza Lima' && !('name_from_contact_at' in linha), JSON.stringify(linha))
  confere('nome na ficha: observacao sem o aviso do contato', !/do contato do WhatsApp/.test(String(linha.notes)), String(linha.notes))
}
{
  // Banco ainda sem a coluna (a funcao sobe antes da migration): o cadastro
  // nasce do mesmo jeito, so sem a marca.
  const b = bancoFalso({ semColunaNova: true })
  const criado = await cadastrarDaFicha(b.admin, 'clinica', consulta())
  confere('sem a coluna nova: cadastro criado mesmo assim', criado?.id === 'p1' && b.tentativas.length === 2, JSON.stringify({ criado, n: b.tentativas.length }))
}
{
  // O PostgREST recusa coluna desconhecida no INSERT com PGRST204.
  const b = bancoFalso({ semColunaNova: true, codigoDaColuna: 'PGRST204' })
  const criado = await cadastrarDaFicha(b.admin, 'clinica', consulta())
  confere('sem a coluna nova (PGRST204): cadastro criado mesmo assim', criado?.id === 'p1' && b.tentativas.length === 2, JSON.stringify({ criado, n: b.tentativas.length }))
}

// --- Paciente ja conhecido (25/10/2026) ---

{
  // Recepcao digitou com mascara e sem o 55; o WhatsApp entrega com. Era um
  // cadastro a mais.
  const b = bancoFalso({ pacientes: [paciente({ id: 'k1', name: 'Clara Paes Lima', phone: '(13) 99999-9999' })] })
  const r = await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'Clara Paes Lima' }))
  confere('telefone sem o 55 no cadastro: vincula, nao cria', r?.id === 'k1' && b.inseridos.length === 0, JSON.stringify({ r, n: b.inseridos.length }))
  confere('telefone sem o 55 no cadastro: a consulta fica ligada a ele', b.vinculos[0]?.patient_id === 'k1', JSON.stringify(b.vinculos))
}
{
  // E o contrario: cadastro com 55, numero chegando sem o nono digito.
  const b = bancoFalso({ pacientes: [paciente({ id: 'k1', name: 'Clara Paes Lima', phone: '5513999999999' })] })
  const r = await cadastrarDaFicha(b.admin, 'clinica', consulta({ contact_phone: '551399999999', intake_patient_name: 'Clara Paes Lima' }))
  confere('numero sem o nono digito: vincula', r?.id === 'k1' && b.inseridos.length === 0, JSON.stringify({ r, n: b.inseridos.length }))
}
{
  // A filha marcou o retorno do celular dela; o cadastro tem o do paciente.
  const b = bancoFalso({
    pacientes: [paciente({ id: 'k2', name: 'Antônio Vieira Dias', phone: '13996210965', birth_date: '1941-04-29' })],
  })
  const r = await cadastrarDaFicha(
    b.admin,
    'clinica',
    consulta({ contact_phone: '5513988028653', intake_patient_name: 'Antonio vieira dias', intake_birth_date: '29/04/1941', starts_at: '2026-10-28T17:00:00Z' }),
  )
  confere('outro celular, mesmo nome e nascimento: vincula', r?.id === 'k2' && b.inseridos.length === 0, JSON.stringify({ r, n: b.inseridos.length }))
  confere('outro celular: o numero novo vai para as observacoes', /\(13\) 98802-8653/.test(String(b.notas[0]?.notes)) && /28\/10\/2026/.test(String(b.notas[0]?.notes)), JSON.stringify(b.notas))
  confere('outro celular: o telefone do cadastro nao muda', b.notas.every((n) => !('phone' in n)), JSON.stringify(b.notas))
}
{
  // Acento no cadastro, sem acento na ficha.
  const b = bancoFalso({
    pacientes: [paciente({ id: 'k3', name: 'Conceição Rocha Freire', phone: '5513991927000', birth_date: '1939-10-13' })],
  })
  const r = await cadastrarDaFicha(b.admin, 'clinica', consulta({ contact_phone: '13988343529', intake_patient_name: 'Conceicao Rocha Freire', intake_birth_date: '13/10/1939' }))
  confere('nome sem acento: vincula a "Conceição"', r?.id === 'k3' && b.inseridos.length === 0, JSON.stringify({ r, n: b.inseridos.length }))
}
{
  // Telefone ja anotado nas observacoes: nao repete a nota.
  const b = bancoFalso({
    pacientes: [paciente({ id: 'k4', name: 'Benedito Lima dos Santos', phone: '13997778501', birth_date: '1946-03-09', notes: 'Telefone da filha: (13) 99672-3932.' })],
  })
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ contact_phone: '5513996723932', intake_patient_name: 'Benedito Lima dos Santos', intake_birth_date: '09/03/1946' }))
  confere('telefone ja nas observacoes: nao anota de novo', b.vinculos[0]?.patient_id === 'k4' && b.notas.length === 0, JSON.stringify(b.notas))
}
{
  // A busca pelo telefone falhou: o nome e o nascimento ainda acham, e o
  // numero, que e o mesmo do cadastro, nao vira "outro telefone".
  const b = bancoFalso({
    falhaNoTelefone: true,
    pacientes: [paciente({ id: 'k1', name: 'Clara Paes Lima', phone: '13999999999', birth_date: '1948-02-03' })],
  })
  const silencio = console.warn
  console.warn = () => {}
  const r = await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'Clara Paes Lima' }))
  console.warn = silencio
  confere('busca do telefone falhou: acha pelo nascimento', r?.id === 'k1' && b.inseridos.length === 0, JSON.stringify({ r, n: b.inseridos.length }))
  confere('mesmo numero em outra grafia: sem nota de outro telefone', b.notas.length === 0, JSON.stringify(b.notas))
}
{
  // Irmaos gemeos: mesma data, mesmo sobrenome, nomes diferentes.
  const b = bancoFalso({ pacientes: [paciente({ id: 'k5', name: 'Pedro Souza Lima', phone: '13911112222', birth_date: '1948-02-03' })] })
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'Ana Souza Lima' }))
  confere('gemeo com outro nome: cadastro novo', b.inseridos[0]?.name === 'Ana Souza Lima' && b.vinculos[0]?.patient_id === 'p1', JSON.stringify(b.vinculos))
}
{
  // Homonimo: mesmo nome, outra data de nascimento.
  const b = bancoFalso({ pacientes: [paciente({ id: 'k6', name: 'José Santos', phone: '13911112222', birth_date: '1950-05-01' })] })
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'José Santos' }))
  confere('mesmo nome, outro nascimento: cadastro novo', b.inseridos.length === 1, JSON.stringify(b.vinculos))
}
{
  // Sem data na ficha, nome sozinho nao basta.
  const b = bancoFalso({ pacientes: [paciente({ id: 'k7', name: 'José Santos', phone: '13911112222', birth_date: '1948-02-03' })] })
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'José Santos', intake_birth_date: 'marco de 1948' }))
  confere('sem data na ficha: nao junta so pelo nome', b.inseridos.length === 1, JSON.stringify(b.vinculos))
}
{
  // Nem quando o cadastro tambem esta sem data: dois vazios nao sao a mesma data.
  const b = bancoFalso({ pacientes: [paciente({ id: 'k7', name: 'José Santos', phone: '13911112222', birth_date: null })] })
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'José Santos', intake_birth_date: '' }))
  confere('sem data dos dois lados: cadastro novo', b.inseridos.length === 1, JSON.stringify(b.vinculos))
}
{
  // Cadastro arquivado nao recebe consulta nova.
  const b = bancoFalso({
    pacientes: [paciente({ id: 'k8', name: 'Clara Paes Lima', phone: '5513999999999', birth_date: '1948-02-03', archived_at: '2026-10-01T00:00:00Z' })],
  })
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'Clara Paes Lima' }))
  confere('arquivado: nao vincula', b.inseridos.length === 1, JSON.stringify(b.vinculos))
}
{
  // Casal com um celular so: a consulta da esposa nao vai para o prontuario
  // do marido (na origem, 14/10/2026, eram irmaos no celular da mae).
  const b = bancoFalso({ pacientes: [paciente({ id: 'k9', name: 'José Carlos Lima', phone: '13999999999', birth_date: '1944-06-10' })] })
  await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: 'Maria Lúcia Lima' }))
  confere('esposa no celular do marido: cadastro novo', b.inseridos[0]?.name === 'Maria Lúcia Lima' && b.vinculos[0]?.patient_id === 'p1', JSON.stringify(b.vinculos))
}
{
  // O mesmo telefone, sem nome na ficha: o de sempre, o primeiro do telefone.
  const b = bancoFalso({ pacientes: [paciente({ id: 'k10', name: 'José Carlos Lima', phone: '13999999999' })] })
  const r = await cadastrarDaFicha(b.admin, 'clinica', consulta({ intake_patient_name: '' }))
  confere('sem nome na ficha e telefone conhecido: vincula', r?.id === 'k10' && b.inseridos.length === 0, JSON.stringify({ r, n: b.inseridos.length }))
}

// --- mesmaPessoa ---
confere('"Helena" e "Helena Martins Costa": mesma pessoa', mesmaPessoa('Helena', 'Helena Martins Costa'))
confere('"Maria Aparecida Souza" e "Maria Lúcia Souza": outra pessoa', !mesmaPessoa('Maria Aparecida Souza', 'Maria Lúcia Souza'))
confere('"José da Silva" e "Jose Silva": mesma pessoa', mesmaPessoa('José da Silva', 'Jose Silva'))
confere('nome vazio nunca e a mesma pessoa', !mesmaPessoa('', 'Jose Silva'))

console.log(`cadastro: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}
