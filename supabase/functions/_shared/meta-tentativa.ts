/**
 * Mais uma tentativa quando a Meta falha do lado dela (26/10/2026).
 *
 * No sistema do Dr. Marcello, um menu mandado pela Central voltou "(#131000)
 * Something went wrong". O mesmo menu, com o mesmo texto, tinha chegado a
 * outras pessoas nos dias anteriores, e foi a unica falha de envio em tres
 * dias: 131000 e erro interno da Meta, e a propria documentacao manda tentar
 * de novo. Uma tentativa a mais, segundo e meio depois, resolve sem a equipe
 * precisar ver o "falhou" e clicar outra vez. Aqui vale em dobro: a resposta
 * do robo que falha no meio da conversa deixa o paciente idoso sem saber se
 * foi entendido.
 *
 * So nos erros passageiros. Recusa de verdade (janela de 24 horas fechada,
 * numero invalido, modelo nao aprovado) nao melhora repetindo. E a recusa vem
 * antes de a Meta aceitar a mensagem, entao a segunda tentativa nao duplica
 * nada.
 *
 * O limite do par (07/11/2026, portado do sistema do Dr. Marcello, onde
 * aconteceu em 30/10) tem outro ritmo. La, a clinica mandou 10 arquivos em 20
 * segundos para o mesmo numero e o menu, logo atras, voltou "(#131056) pair
 * rate limit hit". E a Meta dizendo que a clinica mandou demais para ESSA
 * pessoa em pouco tempo: nao e recusa de verdade, mas segundo e meio nao
 * resolve, porque a cota volta devagar. Aqui pode acontecer quando a Dra.
 * repassa varios arquivos seguidos ao paciente. Por isso mais de uma
 * tentativa, com espera crescente (51 segundos no total). Quem chamou continua
 * vendo a falha se nada adiantar: a etiqueta "falhou" e o aviso nao mudam.
 */

/** 131000 erro interno; 131016 servico fora; 133004 servidor indisponivel por um momento. */
export const ERROS_PASSAGEIROS: readonly number[] = [131000, 131016, 133004]
export const ESPERA_DA_NOVA_TENTATIVA_MS = 1500
/** 131056: mandou demais para o mesmo numero em pouco tempo. */
export const ERRO_DO_LIMITE_DO_PAR = 131056
export const ESPERAS_DO_LIMITE_DO_PAR_MS: readonly number[] = [6000, 15000, 30000]

export async function postarNaMeta(
  url: string,
  init: RequestInit,
  opcoes: { buscar?: typeof fetch; esperar?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const buscar = opcoes.buscar ?? fetch
  const primeira = await buscar(url, init)
  if (primeira.ok) return primeira
  const codigo = await codigoDoErro(primeira)
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)))
  if (codigo === ERRO_DO_LIMITE_DO_PAR) {
    let ultima = primeira
    for (const espera of ESPERAS_DO_LIMITE_DO_PAR_MS) {
      console.warn(`Meta devolveu o limite do par (${codigo}); nova tentativa em ${espera} ms`)
      await esperar(espera)
      ultima = await buscar(url, init)
      if (ultima.ok || (await codigoDoErro(ultima)) !== ERRO_DO_LIMITE_DO_PAR) return ultima
    }
    console.warn('Meta manteve o limite do par depois de todas as tentativas; fica como falha')
    return ultima
  }
  if (codigo === null || !ERROS_PASSAGEIROS.includes(codigo)) return primeira
  console.warn(`Meta devolveu o erro passageiro ${codigo}; tentando de novo`)
  await esperar(ESPERA_DA_NOVA_TENTATIVA_MS)
  const segunda = await buscar(url, init)
  if (!segunda.ok) console.warn(`Meta falhou de novo depois do erro ${codigo}; fica como falha`)
  return segunda
}

/** O codigo do erro, lido de uma copia: quem chamou ainda le o corpo original. */
async function codigoDoErro(r: Response): Promise<number | null> {
  try {
    const corpo = await r.clone().json()
    const codigo = Number(corpo?.error?.code)
    return Number.isFinite(codigo) ? codigo : null
  } catch {
    return null
  }
}
