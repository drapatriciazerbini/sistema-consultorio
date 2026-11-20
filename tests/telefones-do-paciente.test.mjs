// Mais de um telefone no mesmo cadastro (porte de 18/11/2026).
// Regras em supabase/functions/_shared/telefones-do-paciente.ts,
// src/lib/procurar-paciente.ts e no cadastro da ficha (_shared/cadastro.ts).
// Nomes e numeros inventados.
import assert from 'node:assert/strict'
import { filtroDasConsultas, idsPorOutroTelefone, juntarPacientes, pacientesDoTelefone, QUEM_E_O_TELEFONE } from './telefones-do-paciente.build.mjs'
import { jaCadastrados, procurarPacientes } from './procurar-paciente.build.mjs'
import { cadastrarDaFicha } from './cadastro.build.mjs'
import { bancoFalso } from './fixtures/banco-falso.mjs'
import { readFileSync } from 'node:fs'

let ok = 0
async function caso(nome, fn) {
  try {
    await fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

// Os avisos de "tabela ausente" sao esperados em alguns casos: ficam guardados
// para o teste conferir que o caminho de erro gritou, em vez de sujar a saida.
const avisos = []
const avisar = console.warn
console.warn = (...partes) => avisos.push(partes.map(String).join(' '))

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'
// O cadastro do Seu Jose tem o celular dele; a filha escreve do dela.
const DO_PACIENTE = ['5513990001111', '13990001111', '551390001111', '1390001111']
const DA_FILHA = ['5513990002222', '13990002222', '551390002222', '1390002222']
const banco = (extra = {}, opcoes = {}) =>
  bancoFalso(
    {
      patients: [
        { id: P1, clinic_id: 'c1', name: 'Jose Teste', phone: '13990001111', phone_digits: '13990001111', archived_at: null, whatsapp_opt_out_at: null },
        { id: P2, clinic_id: 'c1', name: 'Marta Teste', phone: '13990002222', phone_digits: '13990002222', archived_at: null, whatsapp_opt_out_at: null },
        { id: P3, clinic_id: 'c2', name: 'Outra Clinica', phone: '13990001111', phone_digits: '13990001111', archived_at: null, whatsapp_opt_out_at: null },
      ],
      patient_phones: [{ id: 'f1', clinic_id: 'c1', patient_id: P1, digits: '5513990002222', rotulo: 'Filha' }],
      appointments: [],
      ...extra,
    },
    opcoes,
  )

await caso('junta sem repetir, os do telefone do cadastro primeiro', () => {
  const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }
  assert.deepEqual(juntarPacientes([a, b], [b, c]).map((p) => p.id), ['a', 'b', 'c'])
  assert.deepEqual(juntarPacientes([], [c]).map((p) => p.id), ['c'])
  assert.deepEqual(juntarPacientes([a], []).map((p) => p.id), ['a'])
})

await caso('acha o paciente pelo segundo telefone, em qualquer grafia', async () => {
  assert.deepEqual(await idsPorOutroTelefone(banco(), 'c1', DA_FILHA), [P1])
  assert.deepEqual(await idsPorOutroTelefone(banco(), 'c1', DO_PACIENTE), [])
  assert.deepEqual(await idsPorOutroTelefone(banco(), 'c2', DA_FILHA), [], 'segundo telefone nao atravessa clinica')
  assert.deepEqual(await idsPorOutroTelefone(banco(), 'c1', []), [])
})

await caso('sem a tabela (migration nao chegou): ninguem, nada quebra, e o log avisa', async () => {
  avisos.length = 0
  assert.deepEqual(await idsPorOutroTelefone(banco({}, { semTabela: ['patient_phones'] }), 'c1', DA_FILHA), [])
  assert.equal(avisos.length, 1, 'a falta da tabela nao pode ser calada')
  assert.match(avisos[0], /Sem patient_phones/)
  const r = await pacientesDoTelefone(banco({}, { semTabela: ['patient_phones'] }), 'c1', DA_FILHA, 'id,name')
  assert.deepEqual(r.pacientes.map((p) => p.id), [P2], 'o telefone do cadastro continua valendo')
  assert.deepEqual(r.idsDosOutros, [])
})

await caso('a filha que escreve do numero dela: o proprio cadastro e o do pai ligado', async () => {
  const r = await pacientesDoTelefone(banco(), 'c1', DA_FILHA, 'id,name')
  assert.deepEqual(r.pacientes.map((p) => p.id), [P2, P1], 'o do telefone do cadastro primeiro')
  assert.deepEqual(r.idsDosOutros, [P1])
})

await caso('numero que so esta no cadastro: como sempre foi', async () => {
  const r = await pacientesDoTelefone(banco(), 'c1', DO_PACIENTE, 'id,name')
  assert.deepEqual(r.pacientes.map((p) => p.id), [P1])
  assert.deepEqual(r.idsDosOutros, [])
})

await caso('o mesmo numero no cadastro e como segundo telefone do mesmo paciente nao repete', async () => {
  const b = banco({ patient_phones: [{ id: 'f1', clinic_id: 'c1', patient_id: P1, digits: '13990001111' }] })
  const r = await pacientesDoTelefone(b, 'c1', DO_PACIENTE, 'id,name')
  assert.deepEqual(r.pacientes.map((p) => p.id), [P1])
  assert.deepEqual(r.idsDosOutros, [])
})

await caso('cadastro arquivado nao volta pelo segundo telefone', async () => {
  const b = banco()
  b.db.patients.find((p) => p.id === P1).archived_at = '2026-11-01T00:00:00Z'
  const r = await pacientesDoTelefone(b, 'c1', DA_FILHA, 'id,name')
  assert.deepEqual(r.pacientes.map((p) => p.id), [P2])
  assert.deepEqual(r.idsDosOutros, [])
})

await caso('consultas: so muda o filtro para quem entrou pelo segundo telefone', () => {
  assert.equal(filtroDasConsultas(DA_FILHA, []), null, 'sem segundo telefone, a busca de sempre')
  assert.equal(
    filtroDasConsultas(['5513990002222', '13990002222'], [P1]),
    'contact_phone.in.(5513990002222,13990002222),patient_id.in.(' + P1 + ')',
  )
  assert.equal(filtroDasConsultas(DA_FILHA, ['x); drop']), null, 'id que nao e uuid nao entra no filtro')
  assert.equal(filtroDasConsultas([], [P1]), null)
  assert.equal(filtroDasConsultas(['13 99000-2222'], [P1]), null, 'grafia com simbolo nao entra no filtro')
})

await caso('pedido feito pela filha, do numero dela: usa o cadastro do pai, sem criar outro', async () => {
  const b = banco({ appointments: [{ id: 'a1', clinic_id: 'c1', patient_id: null }] })
  const antes = b.db.patients.length
  const paciente = await cadastrarDaFicha(b, 'c1', {
    id: 'a1',
    starts_at: '2026-12-15T13:00:00Z',
    contact_phone: '5513990002222',
    contact_name: 'Marta Teste',
    intake_patient_name: 'Jose Teste',
    intake_birth_date: null,
    intake_guardian: null,
    intake_cpf: null,
    intake_email: null,
  })
  assert.equal(paciente?.id, P1)
  assert.equal(b.db.patients.length, antes, 'nenhum cadastro novo')
  assert.equal(b.db.appointments[0].patient_id, P1)
})

await caso('procurar paciente: sem acento, em qualquer ordem, tambem pelo acompanhante', () => {
  const lista = [
    { id: '1', nome: 'José Carlos Lima', responsavel: 'Cícera Lima' },
    { id: '2', nome: 'Ana Josefina Souza', responsavel: 'Paulo Souza' },
    { id: '3', nome: 'Cícero Prado', responsavel: 'Rosa Prado' },
  ]
  assert.deepEqual(procurarPacientes(lista, 'lima jose').map((p) => p.id), ['1'])
  assert.deepEqual(procurarPacientes(lista, 'jose').map((p) => p.id), ['1', '2'], 'quem comeca pelo termo vem antes')
  assert.deepEqual(procurarPacientes(lista, 'cicer').map((p) => p.id), ['3', '1'], 'pelo nome antes de pelo acompanhante')
  assert.deepEqual(procurarPacientes(lista, 'j'), [], 'uma letra nao lista a clinica inteira')
  assert.deepEqual(procurarPacientes(lista, '   '), [])
  assert.deepEqual(procurarPacientes(lista, 'zeca'), [])
  assert.equal(procurarPacientes(Array.from({ length: 30 }, (_, i) => ({ id: String(i), nome: 'Maria ' + i })), 'maria').length, 8)
})

// Porte de 20/11/2026 do sistema do Dr. Marcello (17/11): paciente da casa
// marcado como "novo", com o telefone digitado errado. A janela de marcar
// passa a avisar antes de confirmar.
await caso('paciente novo que ja tem cadastro: avisa pelo nome e pelo telefone', () => {
  const lista = [
    { id: '1', nome: 'Antônio Teste Lima Monteiro', telefone: '(13) 99000-3062' },
    { id: '2', nome: 'Maria Souza', telefone: '13990002222' },
    { id: '3', nome: 'José Souza', telefone: '5513990002222' },
    { id: '4', nome: 'Dirce', telefone: '' },
  ]
  const ids = (nome, fone) => jaCadastrados(lista, nome, fone).map((a) => a.paciente.id + ':' + a.motivo)
  // O caso real: nome igual, telefone com um digito trocado.
  assert.deepEqual(ids('Antônio Teste Lima Monteiro', '13990009062'), ['1:nome'])
  assert.deepEqual(ids('antonio  monteiro', ''), ['1:nome'], 'sem acento, sem ordem, so parte do nome')
  assert.deepEqual(ids('Antonia Monteiro', ''), [], 'palavra inteira: Antonio nao e Antonia')
  assert.deepEqual(ids('Maria', ''), [], 'um nome so nao acende a clinica')
  assert.deepEqual(ids('dirce', ''), ['4:nome'], 'a nao ser que seja o nome inteiro do cadastro')
  // Telefone igual com outro nome: o casal no telefone da filha; avisa os dois, sem depender de 55 e DDD.
  assert.deepEqual(ids('Rosa Souza', '(13) 99000-2222'), ['3:telefone', '2:telefone'])
  assert.deepEqual(ids('Maria Souza', '13990002222'), ['2:nome', '3:telefone'], 'nome igual vem antes')
  assert.deepEqual(ids('Zeca Novo', '13988887777'), [], 'paciente novo de verdade nao recebe aviso')
  assert.deepEqual(ids('Zeca Novo', '2222'), [], 'telefone incompleto nao compara')
  assert.deepEqual(ids('', ''), [])
})

// A lista da tela e o limite do banco precisam combinar: rotulo com mais de 40
// caracteres seria cortado pela funcao, e o que aparece na conversa nao seria
// o que a equipe escolheu. E consultorio de geriatria nao tem "Mae" nem "Pai".
await caso('os rotulos cabem na coluna e falam de familia de idoso', () => {
  assert.ok(QUEM_E_O_TELEFONE.length >= 3)
  assert.equal(new Set(QUEM_E_O_TELEFONE).size, QUEM_E_O_TELEFONE.length)
  for (const rotulo of QUEM_E_O_TELEFONE) {
    assert.ok(rotulo.length >= 1 && rotulo.length <= 40, rotulo)
    assert.doesNotMatch(rotulo, /^(mãe|pai|avó|avô)/i, rotulo)
  }
})

// A tabela nova guarda de quem e cada telefone: sem RLS forcada, ou com grant
// de escrita para a tela, qualquer login ligaria um numero a um paciente.
await caso('a migration fecha a tabela: RLS forcada, leitura por clinica, sem escrita pela tela', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261118032000_segundo_telefone_do_paciente.sql', import.meta.url), 'utf8')
  assert.match(sql, /alter table public\.patient_phones enable row level security;/)
  assert.match(sql, /alter table public\.patient_phones force row level security;/)
  assert.match(sql, /for select to authenticated\s+using \(\(select private\.is_clinic_member\(clinic_id\)\)\)/)
  assert.match(sql, /revoke all on table public\.patient_phones from public, anon, authenticated;/)
  // Sem as linhas de comentario: a palavra "grant" aparece nelas.
  const semComentario = sql.split('\n').filter((linha) => !linha.trimStart().startsWith('--')).join('\n')
  const grants = [...semComentario.matchAll(/grant ([^;]+?)\s+on table public\.patient_phones to (\w+);/g)].map((m) => [m[2], m[1].replace(/\s+/g, ' ')])
  assert.deepEqual(grants, [
    ['authenticated', 'select (id, clinic_id, patient_id, digits, rotulo, created_at)'],
    ['service_role', 'select, insert, update, delete'],
  ])
  assert.ok(sql.trimStart().startsWith('begin;') && sql.trimEnd().endsWith('commit;'))
})

console.warn = avisar
console.log('telefones do paciente: ' + ok + ' casos passaram')
