// As regras do cadastro do paciente (src/lib/cadastro-do-paciente.ts), usadas
// por Pacientes e pelo popup aberto no nome do paciente na conversa (07/11/2026,
// porte do sistema do Dr. Marcello). Dados ficticios: o repositorio e publico.
import assert from 'node:assert/strict'
import {
  cadastroAlterado,
  cadastroVazio,
  conferirCadastro,
  formularioDoCadastro,
} from './cadastro-do-paciente.build.mjs'

let ok = 0
function caso(nome, fn) {
  try {
    fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

const PACIENTE = {
  id: 'p1',
  nome: 'Paciente de Teste',
  responsavel: 'Acompanhante de Teste',
  nascimento: '1940-05-10',
  sexo: 'F',
  telefone: '13900000000',
  cpf: '00000000000',
  email: 'teste@exemplo.com',
  cidade: 'Santos',
  bairro: 'Gonzaga',
  convenio: '',
  cid: '',
  unidade: 'Consultório',
  dataConsulta: '2026-11-03',
  observacoes: '',
  criadoEm: '2026-11-01T10:00:00Z',
  criadoAutomaticamenteEm: '',
  followups: {},
}

function preenchido(extra = {}) {
  return { ...formularioDoCadastro(PACIENTE), ...extra }
}

caso('ficha aberta mostra telefone e CPF com mascara, e o convenio como esta', () => {
  const form = formularioDoCadastro(PACIENTE)
  assert.equal(form.telefone, '(13) 9 0000-0000')
  assert.equal(form.cpf, '000.000.000-00')
  // Aqui o convenio vazio continua vazio: so a origem escreve "Particular".
  assert.equal(form.convenio, '')
  assert.equal(formularioDoCadastro({ ...PACIENTE, convenio: 'Unimed' }).convenio, 'Unimed')
  assert.equal(form.sexo, 'F')
  assert.equal(form.responsavel, 'Acompanhante de Teste')
  assert.equal(form.cidade, 'Santos')
  assert.equal(form.bairro, 'Gonzaga')
})

caso('cadastro completo passa e grava os mesmos dados', () => {
  const r = conferirCadastro(preenchido())
  assert.ok('cadastro' in r, r.erro)
  assert.equal(r.cadastro.nome, 'Paciente de Teste')
  assert.equal(r.cadastro.sexo, 'F')
  assert.equal(r.cadastro.convenio, '')
  assert.equal(r.cadastro.bairro, 'Gonzaga')
})

caso('nome em branco e recusado', () => {
  assert.equal(conferirCadastro(preenchido({ nome: '   ' })).erro, 'Informe o nome do paciente.')
})

caso('telefone sem DDD e recusado; com DDD passa', () => {
  assert.equal(conferirCadastro(preenchido({ telefone: '9 0000-0000' })).erro, 'Informe um telefone válido com DDD.')
  assert.ok('cadastro' in conferirCadastro(preenchido({ telefone: '(13) 3000-0000' })))
})

caso('sem data da consulta e recusado', () => {
  assert.equal(conferirCadastro(preenchido({ dataConsulta: '' })).erro, 'Informe a data da consulta.')
})

caso('sexo em branco e recusado (vai para a receita da Memed)', () => {
  assert.match(conferirCadastro(preenchido({ sexo: '' })).erro, /Escolha o sexo/)
  assert.match(conferirCadastro(preenchido({ sexo: '' })).erro, /Memed/)
})

caso('alterado: igual nao conta; qualquer campo mudado conta', () => {
  const antes = formularioDoCadastro(PACIENTE)
  assert.equal(cadastroAlterado(antes, { ...antes }), false)
  assert.equal(cadastroAlterado(antes, { ...antes, bairro: 'Boqueirao' }), true)
  assert.equal(cadastroAlterado(antes, { ...antes, observacoes: 'prefere a tarde' }), true)
  assert.equal(cadastroAlterado(antes, { ...antes, responsavel: 'Outro acompanhante' }), true)
})

caso('cadastro novo comeca sem sexo e sem convenio', () => {
  const vazio = cadastroVazio('Consultório')
  assert.equal(vazio.sexo, '')
  assert.equal(vazio.convenio, '')
  assert.equal(vazio.unidade, 'Consultório')
  assert.equal(cadastroVazio().unidade, '')
})

console.log(`cadastro-do-paciente: ${ok} verificacoes ok`)
