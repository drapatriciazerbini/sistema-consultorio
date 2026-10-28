/**
 * Data de nascimento digitada pela familia, convertida para o formato do banco.
 *
 * Existe desde 22/09/2026. Uma mae respondeu a ficha com "25/07/23" e o
 * cadastro saiu SEM data de nascimento: as duas leituras que havia (a ficha e o
 * cadastro criado na vespera) so aceitavam ano com quatro digitos. E sem data
 * de nascimento a Memed recusa a receita - o medico so descobriria com a
 * crianca na frente dele.
 *
 * Uma leitura so, usada pelos dois lugares, para que a regra nao divirja de
 * novo.
 *
 * Devolve null quando nao da para ter certeza. "marco de 2019" continua no
 * agendamento, escrito como veio, para alguem da equipe ler: uma data inventada
 * no prontuario e pior do que um campo vazio.
 */
export function dataDeNascimentoIso(texto: string, hoje = new Date()): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (!m) return null

  const dia = Number(m[1])
  const mes = Number(m[2])
  let ano = Number(m[3])

  // Ano com dois digitos. A regra veio do sistema do Dr. Marcello, onde a data
  // e de crianca e "23" so podia ser 2023. Aqui e o contrario (27/10/2026): a
  // Dra. Patricia atende adulto e idoso, e "12/03/45" e 1945. A regra pediatrica
  // gravava 2045 como "futuro" e jogava fora, ou 2023 como bebe no prontuario
  // de uma senhora de 103 anos.
  //  - 1900 + ano, se der ate 105 anos;
  //  - senao 2000 + ano, se der adulto (18 anos ou mais): "05" e 2005;
  //  - senao fica sem data ("20": 106 anos ou 6 anos, nenhum e paciente daqui).
  if (m[3].length === 2) {
    const anoAtual = hoje.getFullYear()
    if (anoAtual - (1900 + ano) <= 105) ano += 1900
    else if (anoAtual - (2000 + ano) >= 18) ano += 2000
    else return null
  }

  if (mes < 1 || mes > 12 || dia < 1) return null
  // Dia que existe naquele mes: 31/02 nao vira 03/03 por arredondamento.
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  if (dia > ultimoDia) return null

  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  // Nascimento no futuro e erro de digitacao, nunca dado.
  const hojeIso = hoje.toISOString().slice(0, 10)
  if (iso > hojeIso) return null

  return iso
}
