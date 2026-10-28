import type { Sexo } from '@/types/patient'

/**
 * Sugere o sexo pelo primeiro nome.
 *
 * Regra de terminacao, que da conta da maioria dos nomes brasileiros, mais uma
 * lista curta para o que a regra erraria ou nao alcancaria.
 *
 * Devolve null quando nao ha confianca, e nesse caso o campo fica em branco.
 * Chutar aqui e pior do que deixar a pessoa escolher: o sexo vai para a receita
 * da Memed, para o "ela/ele" do texto do acompanhamento e para a contagem do
 * painel.
 *
 * As listas da origem (sistema do Dr. Marcello) eram de nomes de criancas.
 * Aqui os pacientes sao adultos e idosos, e alguns nomes comuns nessa geracao
 * enganam a terminacao: "Conceicao" e "Socorro" terminam em "o" e sao de
 * mulher; "Jose" e "Carlos" nao terminam em "o" e sao de homem.
 */
const NOME_FEMININO = new Set([
  'beatriz', 'iris', 'isis', 'ester', 'esther', 'raquel', 'rachel', 'isabel', 'ingrid',
  'karen', 'karin', 'carmen', 'carmem', 'ruth', 'miriam', 'noemi', 'ellen', 'helen', 'nicole',
  'alice', 'denise', 'thais', 'tais', 'lais', 'ines', 'mercedes', 'jasmim', 'yasmin',
  'lorena', 'agnes', 'sol',
  // Comuns entre as pacientes mais velhas.
  'conceicao', 'assuncao', 'socorro', 'rosario', 'lourdes', 'irene', 'ivone', 'dulce',
  'ivete', 'neide', 'cleide', 'marlene', 'arlete', 'edite', 'edith', 'judite', 'elisabete',
  'elizabete', 'ivonete', 'rose', 'aline', 'jaqueline', 'simone', 'nair', 'leonor', 'eunice',
  'clarice', 'abigail', 'dirce', 'zuleide', 'elaine', 'solange', 'yolanda', 'ilda', 'hilda',
])
const NOME_MASCULINO = new Set([
  'luca', 'nicola', 'noa', 'gabriel', 'rafael', 'miguel', 'daniel', 'samuel', 'ismael',
  'israel', 'joel', 'emanuel', 'manuel', 'matheus', 'mateus', 'lucas', 'nicolas', 'davi',
  'david', 'levi', 'vinicius', 'anderson', 'jefferson', 'wesley', 'kaique', 'felipe',
  'alexandre', 'andre', 'vicente', 'henrique', 'jorge', 'enzo', 'ravi', 'yuri', 'igor',
  'heitor', 'arthur', 'artur', 'benjamin', 'bernardo', 'joao', 'luiz', 'luis', 'thomas',
  // Comuns entre os pacientes mais velhos.
  'jose', 'carlos', 'joaquim', 'manoel', 'wilson', 'nelson', 'edson', 'milton', 'walter',
  'valter', 'cesar', 'osmar', 'valdir', 'ademir', 'moises', 'elias', 'abel', 'rui', 'ruy',
  'jaime', 'jair', 'vitor', 'victor', 'nilton', 'hamilton', 'adilson', 'gilson', 'nilson',
  'wagner', 'cleber', 'edmilson', 'edgar', 'oscar', 'ivan', 'jonas', 'tomas', 'raul',
  'onofre', 'denis', 'dirceu', 'amauri',
])

export function sexoPeloNome(nomeCompleto: string): 'F' | 'M' | null {
  const primeiro = nomeCompleto
    .trim()
    .split(/\s+/)[0]
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  if (!primeiro || primeiro.length < 3) return null

  if (NOME_FEMININO.has(primeiro)) return 'F'
  if (NOME_MASCULINO.has(primeiro)) return 'M'

  const fim = primeiro.at(-1)
  if (fim === 'a') return 'F'
  if (fim === 'o') return 'M'
  return null
}

/**
 * O sexo do formulario depois que alguem mexe no nome.
 *
 * Ate aqui o cadastro manual abria com Feminino ja marcado. No sistema do Dr.
 * Marcello (24/10/2026) quem nao reparava no campo salvava menino como menina,
 * e o placar do painel mostrou a conta inflada. Aqui o mesmo formulario abria
 * igual, e o erro ia parar na receita da Memed. Agora o campo comeca em branco
 * e o salvar exige escolha.
 *
 * A sugestao acompanha o nome enquanto ele e digitado ou corrigido - inclusive
 * no cadastro que veio do WhatsApp com o nome de quem escreveu (muitas vezes a
 * filha ou o cuidador), quando a recepcao troca pelo nome do paciente. Escolha
 * da equipe manda: depois que alguem escolhe no campo, mudar o nome nao mexe
 * mais no sexo.
 */
export function sexoAoDigitarNome(
  nome: string,
  atual: Sexo | '',
  sugerido: boolean,
): { sexo: Sexo | ''; sugerido: boolean } {
  if (atual && !sugerido) return { sexo: atual, sugerido: false }
  const palpite = sexoPeloNome(nome)
  return palpite ? { sexo: palpite, sugerido: true } : { sexo: '', sugerido: false }
}
