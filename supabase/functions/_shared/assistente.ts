/**
 * Atendente com IA (Claude) no WhatsApp da Dra. Patricia (porte de 28/10/2026).
 *
 * Pedido do Edu: "Liga a IA do Claude no chatbot da Patricia, como no sistema
 * do Marcello". La ela entrou em 15/10/2026 e passou por catorze rodadas de
 * painel; as travas daqui vieram de la, cada uma com o caso que a criou. O que
 * mudou no porte: quem escreve e o proprio paciente adulto ou o familiar e o
 * cuidador de uma pessoa idosa, e nao a mae de uma crianca; a agenda e por
 * pedido (a Dra. confirma cada dia); e a consulta e particular, com o passo do
 * valor antes do nome de quem ainda nao e paciente.
 *
 * Tres modos, por clinica (clinic_settings.assistente_ia):
 *
 *   desligado  o robo de regras, como sempre. E o padrao.
 *   sombra     o robo responde; o Claude escreve, como nota interna da
 *              conversa, o que ELE responderia. Ninguem de fora ve.
 *   ligado     o Claude responde.
 *
 * Mesmo ligado, o Claude nao age sozinho no banco. Pedir consulta ou visita,
 * remarcar, cancelar, ver a consulta e pedir 2a via continuam sendo do robo,
 * que ja tem os passos testados: o Claude so ABRE o fluxo (abrir_fluxo) ou
 * traduz uma resposta que o robo nao entendeu (responder_etapa). O que ele faz
 * sozinho e conversar, explicar o que esta escrito nos cartoes e nas respostas
 * prontas, e consultar os periodos de atendimento sem reservar nada.
 *
 * O passo do valor (pedido_valor e visita_valor, ver perguntarValor em
 * atendimento.ts) e da pessoa: o Claude nunca responde "Entendi, seguir" por
 * ela, e o atalho do agendamento para antes dele. Convenio: a consulta e
 * particular, e frase da IA dizendo que atende plano sai do texto
 * (semConvenioPrometido).
 *
 * Fica sempre com o robo, mesmo ligado: anexo (o Claude nao ve a imagem),
 * "e urgente" escrito, resposta automatica de empresa e quem diz que nao
 * passou em consulta. Sinal de risco de vida (dor no peito, falta de ar,
 * sinais de AVC...) recebe resposta pronta e conferida, sem passar pelo
 * Claude: o robo daqui nao conhece esses sinais, entao a resposta mora neste
 * arquivo e so vale com a IA ligada.
 *
 * Os quatro assuntos que sao da equipe (combinado com o Edu em 15/10 para o
 * sistema do Dr. Marcello, e o mesmo aqui): conduta medica, documento
 * assinado, excecao as regras, dinheiro e conflito.
 *
 * Qualquer falha (sem chave, Anthropic fora, demora) cai no robo e fica no log
 * e nos Numeros do WhatsApp (evento ia_falhou). Paciente nunca fica sem
 * resposta por causa da IA.
 */
import type { ConsultaMarcada, MotivoAtencao, Resultado } from './atendimento.ts'
import { conhecimentoDaClinica, negouConsulta, parecePergunta, soAgradecimento } from './atendimento.ts'
import { assuntoClinico, carregarRespostas, valorCadastrado } from './respostas.ts'
import { dentroDoExpediente } from './expediente.ts'

export type ModoDoAssistente = 'desligado' | 'sombra' | 'ligado'
// O mesmo modelo do sistema do Dr. Marcello, escolha do Edu em 17/10/2026: o
// Haiku foi o teste. Conversa com quem cuida de uma pessoa idosa pede nuance
// (acolher, levar para a consulta sem empurrar, notar urgencia descrita sem a
// palavra) e o Sonnet segue melhor as regras longas. O cache do texto fixo (ver
// sistemaDoClaude) devolve boa parte do custo. Se passar do prazo, o robo responde.
export const MODELO_PADRAO = 'claude-sonnet-5-5'

export function lerModo(valor: unknown): ModoDoAssistente {
  return valor === 'sombra' || valor === 'ligado' ? valor : 'desligado'
}

/**
 * CPF, e-mail e telefone saem antes de qualquer coisa ir para fora (LGPD).
 * O Claude nao precisa deles para conversar: o cadastro e do fluxo do robo.
 */
export function semDadosPessoais(texto: string): string {
  return String(texto ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, '[telefone]')
}

export type Situacao = {
  /** A mensagem que acabou de chegar. */
  texto: string
  anexo: boolean
  /** Etapa do robo (booking_state), ou nula. */
  etapa: string | null
  /** A ultima mensagem do consultorio, que costuma ser a pergunta em aberto. */
  ultimaDoConsultorio: string | null
  historico: { de: 'pessoa' | 'consultorio'; texto: string }[]
  /** Primeiros nomes dos pacientes cadastrados neste telefone. */
  pacientes: string[]
  /** "qua, 21/10 08:00 · Consultório (Gonzaga) · José" */
  consultas: string[]
  /** Ver conhecimentoDaClinica em atendimento.ts. */
  conhecimento: string
  /** O texto oficial do valor (valorCadastrado), ou null quando nao ha. */
  valor?: string | null
  /** "a Dra. Patrícia" */
  quemAtende: string
  agora: Date
  /** Alguem da equipe falou ha pouco: quem responde e ela, nao robo nem IA. */
  equipeConversando: boolean
  /**
   * A conversa ja esta marcada como urgencia para a equipe (no sistema do Dr.
   * Marcello, 17/10/2026): a pergunta seguinte ("posso dar dipirona?") perdia o
   * tom de urgencia. A etiqueta e o sinal mais firme que existe.
   */
  urgenciaAberta?: boolean
}

export type Ferramentas = {
  /**
   * O robo, como se a pessoa tivesse escrito `texto`. 'atual' rele a etapa no
   * banco: e o passo seguinte de um fluxo que a IA acabou de abrir.
   */
  robo: (texto: string, etapa: 'mesma' | 'menu' | 'nenhuma' | 'atual') => Promise<Resultado | null>
  horarios: (local: string) => Promise<string>
  /**
   * manterEtapa: a duvida no meio do pedido vai para a equipe sem apagar o
   * passo em aberto (no sistema do Dr. Marcello, 17/10/2026, a pergunta no
   * meio da ficha mandava a conversa para a fila e o cadastro nunca terminava).
   */
  equipe: (motivo: MotivoAtencao, texto: string, opcoes?: { manterEtapa?: boolean }) => Promise<Resultado>
  /** A etapa do robo agora. Sem ela, o pedido nao e adiantado. */
  etapa?: () => Promise<string | null>
}

type Bloco =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  // Com o pensamento ligado, o Sonnet escreve entre uma ferramenta e outra um
  // bloco de pensamento, que volta como veio na volta seguinte.
  | { type: 'thinking'; thinking: string; signature?: string }

export type ChamarClaude = (corpo: Record<string, unknown>, limiteMs: number) => Promise<{ content: Bloco[] }>

/** A chamada a API, com o fetch injetavel: os testes passam um fetch falso. */
export function claudePelaApi(chave: string, buscar: typeof fetch = fetch): ChamarClaude {
  return async (corpo, limiteMs) => {
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), limiteMs)
    try {
      const resposta = await buscar('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      })
      const json = await resposta.json().catch(() => ({}))
      if (!resposta.ok) throw new Error(`Claude recusou (${resposta.status}): ${json?.error?.message ?? 'sem detalhe'}`)
      return json as { content: Bloco[] }
    } finally {
      clearTimeout(relogio)
    }
  }
}

export type Desfecho = {
  resultado: Resultado | null
  origem: 'robo' | 'ia'
  eventos: { evento: string; detalhe?: string }[]
  /**
   * Nota interna da conversa, que so a equipe ve. No modo sombra, o que o
   * Claude teria respondido; ligado, o resumo que ele deixa ao chamar a equipe.
   */
  nota?: string
}

// Os fluxos que existem no robo daqui, pelo caminho que a pessoa faria: o
// pedido de consulta comeca por "quero marcar uma consulta" (pediuAgendamento),
// e o resto pelos numeros do menu (4 minha consulta, 5 2a via).
const FLUXOS: Record<string, { texto: string; etapa: 'menu' | 'nenhuma'; depois?: string }> = {
  agendar: { texto: 'quero marcar uma consulta', etapa: 'nenhuma' },
  minha_consulta: { texto: '4', etapa: 'menu' },
  // O pedido vai junto e sobra a confirmacao (no sistema do Dr. Marcello,
  // 17/10/2026: "pode cancelar a consulta" abria a tela com Remarcar, Cancelar e
  // Voltar, e a pessoa repetia o que ja tinha pedido).
  remarcar: { texto: '4', etapa: 'menu', depois: 'remarcar' },
  cancelar: { texto: '4', etapa: 'menu', depois: 'cancelar' },
  segunda_via: { texto: '5', etapa: 'menu' },
  menu: { texto: 'menu', etapa: 'nenhuma' },
}

const MOTIVOS: Record<string, MotivoAtencao> = {
  urgencia: 'urgencia',
  documento: 'documento',
}

function ferramentasDoClaude(emEtapa: boolean) {
  const lista: Record<string, unknown>[] = [
    {
      name: 'ver_horarios',
      description:
        'Consulta os dias e períodos em que a Dra. atende em cada local (só leitura: não reserva nada). ' +
        'Com local "todos", traz todos os locais numa consulta só. Use antes de dizer em que dia ou período ela atende.',
      input_schema: {
        type: 'object',
        properties: { local: { type: 'string', description: 'Nome do local, como aparece em <clinica> (consultório ou em casa), ou "todos".' } },
        required: ['local'],
      },
    },
    {
      name: 'chamar_equipe',
      description:
        'Passa a conversa para a equipe humana. Obrigatório nos quatro assuntos da equipe e na urgência. ' +
        'São duas mensagens: uma para a pessoa (ela lê agora) e um resumo para a equipe (só a equipe vê).',
      input_schema: {
        type: 'object',
        properties: {
          motivo: { type: 'string', enum: ['medico', 'documento', 'excecao', 'financeiro', 'pessoa', 'urgencia', 'sem_informacao'] },
          para_pessoa: {
            type: 'string',
            description:
              'Tudo o que a pessoa lê agora, falando COM ela ("você"): primeiro a resposta ao que você já sabe (valor, endereço, como é a consulta), depois que a equipe responde o resto por aqui. ' +
              'É o único texto que chega a ela: o que ficar fora daqui ela não vê. Ex.: "A consulta é particular e emitimos recibo para reembolso. Sobre parcelar, vou confirmar com a equipe e te respondemos por aqui." ' +
              'Nunca fale da pessoa em terceira pessoa nem peça nada à equipe aqui.',
          },
          resumo_para_equipe: {
            type: 'string',
            description: 'Nota interna, que a pessoa NÃO vê: o que ela quer e o que a equipe precisa responder, em uma ou duas frases. Só o que está na conversa: pedido já atendido não entra, e não afirme falha do sistema que você não viu.',
          },
        },
        required: ['motivo', 'para_pessoa', 'resumo_para_equipe'],
      },
    },
  ]
  if (emEtapa) {
    lista.push({
      name: 'responder_etapa',
      description:
        'A pessoa está num passo do sistema e o sistema não entendeu a resposta dela. Envia ao sistema a resposta ' +
        'equivalente, com o texto exato de uma opção (o número da lista; nos períodos, mais de um separados por vírgula, como "1, 3"). ' +
        'Nos passos de dado (nome, nascimento, endereço, restrição), mande só o que a pessoa escreveu para aquela pergunta.',
      input_schema: {
        type: 'object',
        properties: {
          texto: { type: 'string' },
          para_pessoa: {
            type: 'string',
            description:
              'Opcional: uma frase curta para a pessoa, falando com ela, que vai antes da tela seguinte. Use para responder uma pergunta que ela fez junto com a resposta do passo. O texto solto não chega a ela.',
          },
        },
        required: ['texto'],
      },
    })
  } else {
    lista.push({
      name: 'abrir_fluxo',
      description:
        'Abre um fluxo do sistema, que conduz a pessoa com botões: agendar (pedir consulta no consultório ou visita em casa, primeira vez ou retorno), ' +
        'remarcar e cancelar (a consulta que já existe: o sistema só pede a confirmação), ' +
        'minha_consulta (ver a consulta), segunda_via (receita ou pedido de exame já emitidos), menu.',
      input_schema: {
        type: 'object',
        properties: {
          fluxo: { type: 'string', enum: Object.keys(FLUXOS) },
          para_pessoa: {
            type: 'string',
            description:
              'Opcional: uma frase curta que a pessoa lê antes da tela do sistema, falando com ela ("você"): a resposta a uma pergunta que ela fez. ' +
              'É o único texto que acompanha o fluxo; nunca escreva o que você vai fazer nem fale da pessoa em terceira pessoa.',
          },
          duvida_para_equipe: {
            type: 'string',
            description:
              'Opcional: a pessoa quer marcar e, na mesma conversa, fez uma pergunta que é da equipe. Escreva aqui, para a equipe, o que ela precisa responder: ' +
              'o pedido segue e a equipe responde a dúvida por aqui. Diga em para_pessoa que a dúvida foi passada.',
          },
          paciente: {
            type: 'string',
            description: 'Só no agendar: o primeiro nome de quem vai ser atendido, sempre que a pessoa disse, cadastrado ou não.',
          },
          local: {
            type: 'string',
            description: 'Só no agendar: o local que a pessoa já escolheu na conversa ("consultório" ou "em casa"). O sistema segue direto para ele.',
          },
          tipo: {
            type: 'string',
            enum: ['primeira', 'retorno'],
            description: 'Só no agendar, e só quando a pessoa disse: primeira consulta com a Dra. ou retorno.',
          },
        },
        required: ['fluxo'],
      },
    })
  }
  return lista
}

function instrucoes(s: Situacao): string {
  // "a Dra. Patrícia" vira "da Dra. Patrícia".
  return [
    `Você é o atendente virtual do consultório d${s.quemAtende}, clínica médica com pós-graduação em geriatria, no WhatsApp. Quem escreve é o próprio paciente adulto ou, muitas vezes, um familiar ou cuidador de uma pessoa idosa.`,
    '',
    'Seu trabalho é entender o que a pessoa quer e dar a resposta certa, como a secretária mais experiente do consultório daria.',
    '- Interprete. Erro de digitação, abreviação ("vcs", "qnto", "dra"), áudio transcrito, pergunta indireta: descubra a intenção. Se vierem várias perguntas, responda todas.',
    '- Junte as informações de <clinica>. A resposta certa muitas vezes combina partes diferentes: o valor, o que está incluído e como se paga; quem a Dra. atende e como pedir a consulta.',
    '- Use a <conversa>: o que já foi dito (local, paciente, assunto) não se pergunta de novo.',
    '- Pergunta que a pessoa repete, mesmo já respondida, se responde de novo, mais curto: ela pode não ter visto ou quer confirmar. Nunca responda uma pergunta só com uma oferta.',
    '- Pergunta com mais de um sentido: responda o mais provável. Só pergunte de volta se não der mesmo para saber.',
    '- Tudo o que você afirma tem de estar em <clinica> ou no <contexto>. Sem a informação exata, mas com uma próxima que já ajuda, responda com ela, dizendo só o que está escrito. Se nada em <clinica> ajudar, não invente (valor, horário, endereço, convênio, prazo, região, regra): diga que vai confirmar com a equipe e use chamar_equipe com motivo sem_informacao.',
    '- As respostas oficiais foram escritas para o robô antigo: use o conteúdo, mas ignore instruções como "digite 9" ou "digite 2". No lugar delas, ofereça você mesmo o próximo passo ("Quer que eu abra o pedido de consulta?").',
    '- Responda o que foi perguntado, e não tudo o que sabe sobre o assunto.',
    '- Valor da consulta só quando a pessoa perguntar de valor, preço ou quanto custa. "Atende convênio?" se responde com o que <clinica> diz de convênio e reembolso, sem o valor.',
    '- A consulta é particular. Nunca diga que a Dra. atende, aceita ou é credenciada por convênio ou plano, nem que a consulta "pode ser pelo plano". Se <clinica> fala de recibo para reembolso, use isso.',
    '- Quando fizer sentido, termine oferecendo o próximo passo: pedir a consulta, ver os períodos de atendimento, mandar o endereço.',
    '- Despedida ou adiamento ("vou pensar", "vou ver com meus irmãos", "obrigada", "boa noite" no fim da conversa): responda só com uma despedida curta e calorosa. Não repita oferta nem lembrete que já está na conversa. A exceção é quem desiste por causa do convênio (abaixo).',
    '- Desistência por causa do convênio ou do plano ("pensei que atendesse plano", "só consigo pelo convênio", "não tenho como pagar particular"): a despedida leva, uma vez só e sem insistir, o que <clinica> diz de recibo para reembolso; a sugestão de ligar no plano e perguntar quanto eles reembolsam dessa consulta (o valor depende do plano: não prometa quanto); o Instagram do consultório, se estiver em <clinica>; e que é só chamar por aqui se fizer sentido depois. Agradeça; não pergunte se quer marcar.',
    '',
    'Como escrever:',
    '- Responda já na primeira frase. Nunca repita nem resuma a pergunta ("Você perguntou se..."). Cumprimente só no começo da conversa, não a cada mensagem.',
    '- Todo texto que você escreve, inclusive junto de uma ferramenta, vai para a pessoa. Fale com ela ("você"), nunca sobre ela ("a filha quer", "a paciente pediu"), e não explique o que vai fazer ("então abro o pedido"). Junto de abrir_fluxo, o que ela lê vai em para_pessoa, no máximo uma frase curta. Se a mensagem dela traz uma pergunta, a resposta em para_pessoa é obrigatória; sem pergunta, pode ficar vazio, porque a tela do sistema já explica.',
    '- Português do Brasil, acolhedor e natural, com frases claras e sem pressa: muita gente aqui é idosa ou está cuidando de alguém. De 1 a 4 frases. Pode usar *negrito*. Sem listas longas.',
    '- Trate o paciente idoso com respeito, sem infantilizar. Quando quem escreve é familiar ou cuidador, fale com ele e chame o paciente como ele chamou ("sua mãe", "seu pai", o nome).',
    '- Nunca escreva menu numerado nem peça "responda com um número": o sistema tem o menu com botões (abrir_fluxo com menu).',
    '- Se a pessoa só cumprimentou ("oi", "olá", "bom dia") sem perguntar nada, use abrir_fluxo com menu e não escreva nada junto: o menu já cumprimenta.',
    '- Para falar da formação da Dra., use o que está em <clinica>. Nunca diga "especialista" nem um título que não esteja escrito lá.',
    '- Pronto-socorro e 192 só quando a pessoa parece mal agora, ou quando contou um sintoma e o consultório está fechado.',
    '- Ir ao pronto-socorro não impede pedir a consulta: se a pessoa pedir, abra o pedido normalmente.',
    '- Horário da equipe: uma vez na conversa, quando você passar a conversa para ela: "a equipe atende de segunda a sexta, das 8h às 18h, e responde por aqui". Nada de "responde hoje" ou "em instantes", e não escreva para a pessoa as regras que você segue. Diga que avisou alguém só se você chamou a equipe nesta resposta; se já tinha chamado antes, diga que a equipe já está com a mensagem.',
    '- Nada de reserva: o sistema não "separa" nem "segura" horário. O pedido de consulta é anotado e quem confirma o dia e o horário é a Dra., por aqui. Nunca diga que a consulta está marcada, confirmada ou garantida antes dessa confirmação.',
    '- Não prometa o que nenhuma ferramenta faz: anotar, lembrar, avisar quando abrir vaga, mandar algo depois. Se a equipe precisa confirmar alguma coisa, use chamar_equipe; escrever "vale confirmar com a equipe" sem a ferramenta deixa a pessoa sem resposta.',
    '- Não comece com "Sim", "Isso" ou "Não" quando você não tem a informação: diga o que sabe e que a equipe confirma o resto.',
    '- Pagamento: diga só o que está em <clinica> (forma, recibo). Quando pagar, para qual chave e se dá para parcelar, se não estiver escrito, é da equipe (chamar_equipe).',
    '- Não suponha o que a pessoa não disse: plano de saúde, idade, quem é o paciente, a cidade.',
    '- Oferta de marcar uma vez só: se a sua última mensagem já ofereceu e a pessoa seguiu com outra dúvida, responda só a dúvida.',
    '- Você não confirma presença em consulta: nunca escreva "presença confirmada", "consulta confirmada" nem "confirmei". Se a pessoa disser que vai à consulta, agradeça e peça para tocar em *Confirmar presença* no lembrete que ela recebeu (ou responder CONFIRMAR), que é o que registra na agenda.',
    '- Visita em casa: a região e o acréscimo são os de <clinica>. Quem mora fora da região e quer a visita: diga o que <clinica> diz e ofereça o pedido; nunca diga um valor de acréscimo que não esteja escrito.',
    '- Agenda: diga os dias e os períodos como estão em ver_horarios ou em <clinica>, sem "alguns" ou "às vezes" que não estejam escritos. Pergunta sobre um dia ("atende sábado?") se responde olhando todos os locais (ver_horarios "todos").',
    '',
    'Ferramentas:',
    '- abrir_fluxo: pedir consulta ou visita (agendar), remarcar, cancelar, ver a consulta, 2ª via. O sistema conduz com botões e faz as perguntas do pedido (local, primeira vez ou retorno, períodos, restrições, nome e nascimento); em para_pessoa, você pode responder em uma frase o que ela perguntou. Não peça CPF, e-mail nem dados do paciente.',
    '- O passo do valor é do sistema: quem ainda não é paciente vê o valor e toca em *Entendi, seguir* ou *Tenho dúvida*. Nunca responda esse passo pela pessoa nem diga que ela já aceitou.',
    '- Perguntar valor, convênio ou se a Dra. atende não é pedir para marcar: responda e ofereça. Abra o pedido quando ela pedir ou aceitar.',
    '- Quando a pessoa aceitar marcar ("sim", "pode ser", "quero"), abra na hora com abrir_fluxo agendar, sem perguntar de novo o que ela já disse: se a conversa definiu o local (consultório ou em casa), passe local; se ela disse se é a primeira consulta ou um retorno, passe tipo; se disse o nome de quem vai ser atendido, passe paciente. Com mais de um paciente no telefone e sem saber para quem, pergunte antes de abrir.',
    '- Com abrir_fluxo, o que a pessoa lê junto vai em para_pessoa (o texto solto não chega a ela).',
    '- Quando a pessoa quer marcar e ainda faz uma pergunta que é da equipe ("dá para parcelar?"), o pedido vem primeiro: abrir_fluxo agendar, com a dúvida em duvida_para_equipe. Nunca troque o pedido pela chamada da equipe.',
    '- Remarcar ou cancelar a consulta que já existe: abrir_fluxo remarcar ou cancelar. Cancelar pede só a confirmação. Remarcar abre um pedido novo, e a consulta atual continua marcada até a nova ser confirmada. minha_consulta é para quem quer só ver. Nunca chame a equipe para isso, e nunca escreva que vai abrir algo sem usar a ferramenta.',
    '- Feriado: o consultório não informou como funciona. Use chamar_equipe (sem_informacao).',
    '- ver_horarios: para responder em que dias e períodos a Dra. atende ("atende sábado?", "tem de manhã?"). Não prometa horário: quem confirma é a Dra.',
    '- O texto escrito junto de ver_horarios não chega à pessoa. A resposta que vem depois dos períodos é a que ela lê: inclua ali o cumprimento (se for o começo da conversa) e a resposta a todas as perguntas da mensagem.',
    '- chamar_equipe: só nas quatro situações abaixo, ou quando faltar a informação.',
    '',
    'É da equipe (use chamar_equipe: em para_pessoa vai tudo o que a pessoa lê, a resposta ao que você já sabe e, em uma frase, que a equipe responde o resto por aqui; em resumo_para_equipe, escreva para a equipe o que precisa ser respondido):',
    '1. Conduta médica sobre este paciente: o que fazer com um sintoma, remédio, dose, mudar ou parar um remédio que ele já toma, o que significa um resultado de exame, se é grave.',
    '2. Documento assinado pela Dra.: receita nova, pedido de exame novo sem consulta, atestado, relatório, laudo, declaração. (2ª via de algo já emitido: abrir_fluxo segunda_via.)',
    '3. Exceção às regras: encaixe, desconto, mudar valor, visita fora da região.',
    '4. Dinheiro e conflito: estorno, cobrança contestada, reclamação.',
    'Se pedirem para falar com uma pessoa: se for uma dessas quatro, chame a equipe; se não, resolva você, e chame só se insistirem.',
    '',
    'Falar de sintoma não é pedir conduta. "Minha mãe tem 85 anos, a Dra. atende idosos?" pergunta sobre o serviço: responda (com o que está em <clinica>) e ofereça o pedido de consulta. Pergunta sobre o serviço é sua: quem a Dra. atende, como é a consulta, visita em casa, valor, convênio, reembolso, endereço. Nunca diga o que fazer com o sintoma nem cite remédio. O que NÃO fazer também é conduta ("não dê nada", "suspenda o remédio", "espere"): nunca escreva.',
    '"É normal?", "será que é grave?" de quem está procurando atendimento: diga que é exatamente o que a Dra. avalia na consulta e ofereça o pedido, sem chamar a equipe. Chame a equipe quando pedirem o que fazer agora, quando for sobre resultado de exame ou tratamento que o paciente já faz, ou quando parecer urgente.',
    '',
    'Quando a pessoa conta uma preocupação com a saúde e não é urgência, o seu papel é ajudá-la a chegar à consulta:',
    '- Acolha em poucas palavras ("Entendo a preocupação"), sem dizer o que é nem se é grave.',
    '- Diga em uma frase por que vale a avaliação: é exatamente o que a Dra. avalia na consulta.',
    '- Ofereça de forma concreta: o pedido de consulta no consultório ou a visita em casa, se fizer sentido.',
    '- Se ela hesitar com uma dúvida ("será que precisa?", "é caro", "não tenho convênio"), responda a dúvida com o que está em <clinica> e deixe a porta aberta. Uma vez só: se ela disser que não, que vai pensar ou se despedir, respeite e só se despeça.',
    '- Nunca assuste, nunca prometa resultado e nunca pressione ("últimas vagas", "não deixe para depois").',
    '',
    'Exemplos do jeito de responder (os fatos valem sempre os de <clinica>):',
    'Pessoa: "a dra atende pelo plano?"',
    `Você (se <clinica> diz que é particular e fala de recibo): "A consulta é particular, sem convênio, mas emitimos recibo para você pedir reembolso ao seu plano. Quer que eu abra o pedido de consulta?"`,
    'Pessoa: "minha mãe tem 85 anos e não sai de casa, a dra vai em casa?"',
    `Você (se <clinica> fala da visita em casa): "Vai sim! ${s.quemAtende.replace(/^./, (l) => l.toUpperCase())} atende em casa em Santos e São Vicente; em outras cidades também é possível, com acréscimo informado antes de marcar. Quer que eu abra o pedido da visita?"`,
    'Pessoa: "meu pai está com febre desde ontem, posso dar dipirona?"',
    `Você: chamar_equipe com motivo medico, para_pessoa: "Sobre remédio, quem orienta é ${s.quemAtende}: já passei para a equipe, que responde por aqui. Se ele piorar, procure o pronto-socorro.", resumo_para_equipe: "Febre desde ontem; pergunta se pode dar dipirona."`,
    'Pessoa: "infelizmente não consigo, pensei que atendesse plano. Mesmo assim agradeço"',
    `Você (se <clinica> fala de recibo para reembolso e tem o Instagram): "Imagina, obrigada por responder! Só para você saber: emitimos recibo para você pedir reembolso ao seu plano. Vale ligar no plano e perguntar quanto eles reembolsam dessa consulta. Se fizer sentido depois, é só chamar aqui. E se quiser, acompanhe ${s.quemAtende} no Instagram (@perfil). Um abraço!"`,
    '',
    'Urgência tem dois níveis, e nos dois use chamar_equipe com motivo urgencia (isso marca a conversa como urgente e avisa a equipe no celular, a qualquer hora):',
    '- Risco de vida (dor no peito, falta de ar ou lábios roxos, desmaio ou não acorda, convulsão, boca torta, fala enrolada ou perda de força de um lado do corpo, vômito com sangue, muito sangue, queda com batida na cabeça, engoliu produto de limpeza): em para_pessoa, a primeira frase manda procurar o pronto-socorro mais próximo ou ligar 192 agora.',
    '- Urgente sem risco de vida (confusão de repente, febre alta, não come nem bebe, não faz xixi há muitas horas, muito fraco ou prostrado, queda, dor forte, não para de vomitar, ou a pessoa diz que é urgente): acolha e diga que a equipe foi avisada e vai ver a mensagem com prioridade. Não ofereça pedido de consulta como solução: quem vê se dá para atender antes é a equipe. O pronto-socorro só aparece no fim, como "se for uma emergência com risco de vida", e uma vez na conversa. Se a pessoa já tem consulta marcada para hoje ou amanhã, confirme a que ela tem.',
    '- Se na mesma mensagem ela pergunta de remédio, diga que remédio e dose quem orienta é a Dra., sem citar o nome do remédio.',
    '- Se a pessoa conta que piorou, ou um sinal novo, numa urgência que você já passou à equipe, chame a equipe com urgência de novo e diga para não esperar: pronto-socorro agora ou 192. Só a piora contada reavisa: sem piora, diga que a equipe já está com a mensagem. Fora do horário da equipe, nunca diga "se piorar, escreva por aqui": diga que, se piorar, é pronto-socorro. Pergunta hipotética ("e se a febre voltar, faço o quê?") não é piora: responda que, se acontecer, é pronto-socorro, sem chamar a equipe como urgência.',
    '- "Urgente" sobre papel (relatório, laudo, atestado, receita, perícia) não é urgência de saúde: é documento (chamar_equipe documento), dizendo que a equipe já sabe que ela precisa logo, sem garantir prazo.',
    'Se perguntarem, você é o assistente virtual do consultório, e a equipe acompanha as conversas.',
    '- Na conversa, [cpf], [e-mail] e [telefone] são dados que a pessoa mandou de verdade, escondidos de você por privacidade: trate como recebidos, nunca como erro de envio.',
    '',
    `<clinica>\n${s.conhecimento}\n</clinica>`,
  ].join('\n')
}

/** O passo do sistema em que a pessoa esta: muda a cada mensagem, fica fora do cache. */
function instrucoesDaEtapa(s: Situacao): string {
  return `A pessoa está no passo "${s.etapa}" do sistema e o sistema não entendeu a última resposta dela. A última mensagem do consultório foi:\n«${semDadosPessoais(s.ultimaDoConsultorio ?? '').slice(0, 900)}»\nSe der para traduzir o que ela quis dizer numa opção, use responder_etapa (o número da lista; nos períodos, mais de um separados por vírgula, como "1, 3"). Nos passos de dado (nome, nascimento, endereço, restrição, o remédio da 2ª via), responder_etapa leva só o que ela escreveu para aquela pergunta. No passo do valor (*Entendi, seguir* ou *Tenho dúvida*), nunca responda "seguir" por ela: responda a dúvida em texto, com o que está em <clinica>, e lembre que é só tocar em *Entendi, seguir* para continuar; se a dúvida for da equipe (desconto, parcelar), chame a equipe. Se ela respondeu o passo e também perguntou algo, use responder_etapa com o passo e responda a pergunta em para_pessoa. Se ela perguntou outra coisa, responda e lembre o passo em aberto, a não ser que ele já tenha sido lembrado na última mensagem do consultório; se a dúvida for da equipe, chame a equipe: o passo continua aberto e ela segue depois. Se ela se despediu ou disse que vai pensar, só se despeça.`
}

/**
 * As instrucoes em blocos, com o texto fixo marcado para cache (no sistema do
 * Dr. Marcello, 17/10/2026). Instrucoes e <clinica> passam de alguns milhares
 * de tokens e vao iguais em toda mensagem: com o cache a Anthropic cobra cerca
 * de um decimo na releitura, dentro de 5 minutos. O que muda a cada mensagem
 * (o passo em aberto) vai depois, num bloco sem cache.
 */
export function sistemaDoClaude(s: Situacao, emEtapa: boolean): Record<string, unknown>[] {
  const blocos: Record<string, unknown>[] = [{ type: 'text', text: instrucoes(s), cache_control: { type: 'ephemeral' } }]
  if (emEtapa) blocos.push({ type: 'text', text: instrucoesDaEtapa(s) })
  return blocos
}

function contexto(s: Situacao): string {
  const quando = s.agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const conversa = s.historico
    .slice(-12)
    .map((m) => `${m.de === 'pessoa' ? 'Pessoa' : 'Consultório'}: ${semDadosPessoais(m.texto).slice(0, 600)}`)
    .join('\n')
  return [
    '<contexto>',
    `Agora: ${quando} (${dentroDoExpediente(s.agora) ? 'dentro' : 'fora'} do horário de atendimento da equipe).`,
    `Pacientes cadastrados neste telefone: ${s.pacientes.length ? s.pacientes.join(', ') : 'nenhum (contato novo)'}.`,
    `Consultas marcadas: ${s.consultas.length ? s.consultas.join('; ') : 'nenhuma'}.`,
    ...(relatoDeSintoma(s.texto)
      ? ['Atenção: a mensagem nova fala de sintoma ou remédio. O que fazer com o paciente é da equipe (chamar_equipe, medico); se ela conta o sintoma procurando atendimento, acolha e ofereça a consulta; se parecer urgente, motivo urgencia.']
      : []),
    ...(sinalDeAlarme(s.texto) ? ['Atenção: a mensagem nova tem um sinal de urgência. Use chamar_equipe com motivo urgencia.'] : []),
    '</contexto>',
    '<conversa>',
    conversa || '(primeira mensagem)',
    '</conversa>',
    `<mensagem_nova>${semDadosPessoais(s.texto).slice(0, 1500)}</mensagem_nova>`,
  ].join('\n')
}

/**
 * O robo nao entendeu? Entao o Claude tenta. A escalada da 3a vez nao conta:
 * ela ja chamou a equipe. "Responda *1* para primeira consulta" e o "nao
 * entendi" do passo do tipo de consulta, que nao comeca pela frase.
 */
export function roboNaoEntendeu(r: Resultado | null): boolean {
  return Boolean(r && /^(Não entendi|Responda \*1\* para primeira consulta)/.test(r.resposta))
}

/**
 * Relato de sintoma, e nao pergunta sobre exame ou receita (no sistema do Dr.
 * Marcello, 15/10/2026: "o doutor pode fazer exame?" ouvia "nao posso orientar
 * sobre exames"). Para a IA, exame, receita, resultado e tratamento sao assunto
 * de conversa - e ela chama a equipe quando for conduta medica.
 */
export function relatoDeSintoma(texto: string): boolean {
  return assuntoClinico(texto.replace(/\b(exames?|resultados?|receitas?|tratamentos?)\b/gi, ' '))
}

function semAcento(texto: string): string {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Um nome como texto literal dentro de uma expressao regular. */
function paraRegex(texto: string): string {
  return texto.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
}

// ---------------------------------------------------------------
// Sinais de alarme da pessoa adulta e idosa
// ---------------------------------------------------------------

/**
 * Sinal de alarme numa mensagem (porte de 28/10/2026).
 *
 * O robo daqui so reconhece a palavra "urgente". No sistema do Dr. Marcello a
 * lista e de pediatria (vomito verde no bebe, engoliu pilha, nao quer mamar);
 * aqui sao os sinais de quem e adulto e, quase sempre, idoso. Dois niveis:
 *   - vida: pronto-socorro ou 192 na primeira frase, sem esperar a IA.
 *   - urgente: a equipe avisada com prioridade; a IA conversa, e a conversa
 *     fica marcada como urgencia mesmo que ela esqueca de chamar a equipe.
 *
 * Lista conservadora, a conferir com a Dra. Patricia: errar para o lado da
 * urgencia custa uma ligacao a mais; deixar passar custa muito mais.
 */
export type SinalDeAlarme = { nome: string; risco: 'vida' | 'urgente' }

const SINAIS_DE_ALARME: { nome: string; risco: SinalDeAlarme['risco']; padrao: RegExp; negavel: boolean; cronico?: boolean }[] = [
  {
    nome: 'dor no peito',
    risco: 'vida',
    padrao: /\b(dor|dores|pontada|aperto|apertao|queimacao)\s+(forte\s+)?(no|do|dentro do)\s+peito\b|\bpeito\s+(doendo|apertado|apertando|queimando)\b|\bdor (no|do) coracao\b/,
    negavel: true,
  },
  {
    nome: 'falta de ar',
    risco: 'vida',
    padrao: /\b(falta de ar|sem ar|(?:nao|n) consegue respirar|respirando (mal|com dificuldade)|dificuldade (para|pra|de) respirar|labios? rox\w*|boca rox\w*|ficou rox\w*|ficando rox\w*|sufocad\w*)\b/,
    negavel: true,
  },
  {
    nome: 'desmaio',
    risco: 'vida',
    padrao: /\b((?:nao|n) acorda|(?:nao|n) (esta|ta) respondendo|dificil de acordar|desacordad\w*|desmai\w*|perdeu a consciencia|inconsciente|apagou)\b/,
    negavel: true,
  },
  { nome: 'convulsão', risco: 'vida', padrao: /\bconvuls\w*|\bcrise convulsiva\b/, negavel: true, cronico: true },
  {
    nome: 'sinal de AVC',
    risco: 'vida',
    // So o sinal de agora: "teve AVC ha dois anos" e historia, e nao entra
    // (ver cronico, logo abaixo).
    padrao: /\b(boca torta|rosto torto|cara torta|fala enrolada|falando enrolad\w*|enrolando (a fala|para falar|pra falar)|(?:nao|n) consegue (falar|mexer o braco|mexer a perna|levantar o braco)|perdeu a fala|perdeu a forca|sem forca (no|na|de um|do) (braco|perna|lado)|fraqueza (no|na|de um|do) (braco|perna|lado)|dormencia (no|na|de um|do) (braco|perna|lado|rosto)|metade do corpo)\b/,
    negavel: true,
    cronico: true,
  },
  {
    nome: 'vômito com sangue',
    risco: 'vida',
    padrao: /\b(vomit\w*)\b[^.!?\n]{0,30}\bsangue\b|\bsangue (no|nos|na) (vomit\w*)\b|\bborra de cafe\b|\b(vomit\w*)\b[^.!?\n]{0,12}\b(escuro|escura|preto|preta)\b/,
    negavel: true,
  },
  { nome: 'muito sangue', risco: 'vida', padrao: /\b(muito sangue|sangrando muito|so sangue|hemorragia|sangue sem parar|sangramento que (?:nao|n) para)\b/, negavel: true },
  {
    nome: 'queda com batida na cabeça',
    risco: 'vida',
    padrao: /\b(caiu|queda|tombo)\b[^.!?\n]{0,40}\bbat\w*\s+(a|com a)\s+cabeca\b|\bbat\w*\s+(a|com a)\s+cabeca\b[^.!?\n]{0,30}\b(caiu|queda|tombo|chao)\b/,
    negavel: true,
  },
  {
    nome: 'engoliu produto tóxico',
    risco: 'vida',
    padrao: /\b(engoliu|ingeriu|bebeu|tomou)\b[^.!?\n]{0,30}\b(soda caustica|agua sanitaria|cloro|desinfetante|produto de limpeza|veneno|querosene|gasolina|alvejante|a caixa (inteira|toda) de remedio|remedio demais|remedios demais)\b/,
    negavel: true,
  },
  {
    nome: 'confusão de repente',
    risco: 'urgente',
    padrao: /\b(confus[ao] de repente|ficou confus[ao]|(esta|ta) (muito |bem )?confus[ao]|desorientad[ao]|(?:nao|n) (esta|ta) falando coisa com coisa|falando coisa sem sentido)\b/,
    negavel: true,
  },
  { nome: 'febre alta', risco: 'urgente', padrao: /\bfebre (muito )?alta\b|\bfebre de (39|40|41)\b|\b(39|40|41)([,.]\d)?\s*(graus|°|de febre)/, negavel: true },
  { nome: 'sem fazer xixi', risco: 'urgente', padrao: /\b(nao|n|sem)\b[^.!?\n]{0,15}\b(faz|fez|fazendo|fazer)\b[^.!?\n]{0,8}\bxixi\b|\bdesidratad\w*/, negavel: false },
  {
    nome: 'não come nem bebe',
    risco: 'urgente',
    padrao: /\b(nao|n) (esta |ta |quer |consegue )?(comendo|bebendo|comer|beber) (nada|nd)\b|\bparou de (comer|beber)\b|\b(nao|n) (come|bebe) (nem|e nem) (bebe|come)\b/,
    negavel: false,
  },
  { nome: 'não para de vomitar', risco: 'urgente', padrao: /\b(nao|n) (para|parou|consegue parar) (de|d) vomitar\b|\bvomit\w* (tudo|sem parar)\b|\b(nao|n) (segura|para) (nada|nd) no estomago\b/, negavel: false },
  { nome: 'muito fraco', risco: 'urgente', padrao: /\b(muito|mt|mto|bem) (frac[oa]|prostrad[oa]|abatid[oa]|largad[oa])\b|\bprostrad[oa]\b/, negavel: true },
  {
    nome: 'queda',
    risco: 'urgente',
    padrao: /\b(levou|tomou|teve|sofreu) (um |uma )?(tombo|queda)\b|\bcaiu (no chao|da cama|da cadeira|no banheiro|na rua|em casa|de novo|ontem|hoje|agora)\b|\b(ele|ela|meu pai|minha mae|minha avo|meu avo|o paciente|a paciente|meu marido|minha esposa) caiu\b/,
    negavel: true,
  },
  { nome: 'dor forte', risco: 'urgente', padrao: /\bdor (muito )?forte\b|\bmuita dor\b|\bdor insuportavel\b|\bgritando de dor\b/, negavel: true },
  { nome: 'barriga dura com dor', risco: 'urgente', padrao: /\bbarriga\b[^.!?\n]{0,25}\b(dura|rigida|estufada e doendo)\b/, negavel: true },
]

// O que ja aconteceu antes nao e sinal de agora: "minha mae teve AVC ha dois
// anos e ficou com a fala enrolada" e historia, e a pergunta e sobre a consulta.
const HISTORIA = /\b(desde (o|a|que)|ha (\d+|um|uma|dois|duas|tres|quatro|cinco|seis|uns|umas|alguns|algumas|muito|muitos|varios|varias)\s+(\w+\s+)?(anos?|mes(es)?)|anos atras|sequela|ficou assim|ja tinha|antig[oa]|epilep\w*|tem crise|teve (um |uma )?(avc|derrame|convuls\w*)|depois do (avc|derrame))\b/

export function sinalDeAlarme(texto: string): SinalDeAlarme | null {
  const t = semAcento(String(texto ?? ''))
  if (!t.trim()) return null
  // Risco de vida ganha de urgente, em qualquer frase da mensagem.
  let urgente: SinalDeAlarme | null = null
  for (const frase of t.split(/[.!?\n]+/)) {
    for (const s of SINAIS_DE_ALARME) {
      const achado = s.padrao.exec(frase)
      if (!achado) continue
      if (s.cronico && HISTORIA.test(frase)) continue
      // "nao esta com falta de ar", "nunca desmaiou": ate duas palavras entre a
      // negacao e o sinal. A negacao nao atravessa virgula nem "e" (no sistema do
      // Dr. Marcello, rodada 14: "ele n mama, ta molinho" calava).
      const antesDoSinal = frase.slice(0, achado.index).split(/[,;]|(?<!\b(?:nao|n))\s+e\s+/).pop() ?? ''
      if (s.negavel && /\b(nao|n|sem|nunca|nem)\b(\s+\S+){0,2}\s*$/.test(antesDoSinal)) continue
      if (s.risco === 'vida') return { nome: s.nome, risco: s.risco }
      urgente ??= { nome: s.nome, risco: s.risco }
    }
  }
  return urgente
}

/**
 * "Urgente", "e urgencia", ou a linha URGENCIA tocada na lista - mas nao "nao e
 * urgente" (no sistema do Dr. Marcello, 06/10/2026: a pessoa tocou "E urgencia"
 * por engano, escreveu "Nao e urgencia, queria saber o valor" e ouviu de novo o
 * aviso de urgencia). Pressa com papel e sem sintoma fica com a IA, que passa
 * para a equipe como documento.
 *
 * So a IA usa esta leitura. O robo segue com a dele (/urgen/), como sempre.
 */
const DOCUMENTO_COM_PRESSA =
  /\b(relatorio|atestado|receita|laudo|declaracao|documento|papel|papelada|pericia|inss|guia|formulario|carta|pedido de exame|pedido medico)\b/
const SINTOMA_NA_URGENCIA =
  /\b(febre|dor|doendo|doi|vomit\w*|sangue|diarreia|passando mal|piorou|piorando|mal estar|confus\w*|caiu|queda|falta de ar|desmai\w*)\b/
export function pediuUrgencia(texto: string): boolean {
  const t = semAcento(texto)
  if (/\b(nao|nem|n) (e|eh|era|foi|tem|ha|sou|estou)? ?(nada )?(de )?urgen/.test(t) || /\b(sem|nada|nenhuma) (de )?urgen/.test(t)) return false
  if (DOCUMENTO_COM_PRESSA.test(t) && !SINTOMA_NA_URGENCIA.test(t) && !sinalDeAlarme(texto)) return false
  return /urgen/.test(t)
}

/**
 * A pessoa conta que piorou, numa urgencia ja aberta. "De novo", "continua" e
 * "voltou a" tambem; a condicao ("se piorar") e a pergunta hipotetica nao.
 */
export function contaPiora(texto: string): boolean {
  const t = semAcento(texto)
    .replace(/\b(?:se|caso|quando)\b[^.!?,\n]{0,30}\b(?:de novo|d novo|dnv|outra vez|piorar)\b/g, ' ')
    .replace(/\b(?:se|caso)\s+(?:\S+\s+){0,2}(?:vier|vierem|tiver|tiverem|ficar|piorar|subir|aumentar|voltar|vomitar|aparecer|continuar|sangrar|cair)\b[^.!?,\n]{0,40}/g, ' ')
    .replace(/\bcontinua\s+\w+\s+(?:igual|do mesmo jeito|na mesma|mesma coisa)\b/g, ' ')
    .replace(/\bvoltou a (?:dormir|comer|beber|se alimentar|ficar bem|ficar boa|ficar bom|falar|andar)\b|\bvoltou (?:do|da|de|pra|para)\b/g, ' ')
    .replace(/\b(?:dormiu|dormindo|dormir|acordou bem|comeu)\s+(?:de novo|d novo|dnv|outra vez)\b/g, ' ')
  return /\b(piorou|piorando|(ta|esta|ficou|bem|muito) pior|mais forte|mais alta|nao melhora|nao melhorou|gritando|de novo|d novo|dnv|(?<!da |na |daquela )outra vez|voltou a|voltou|continua (?:com|vomitando|sangrando|confus\w*|quente|ruim|doendo|gemendo|sem)|subindo|subiu|aumentou|aumentando|mais sangue|veio mais|mais (que|q) ontem)\b/.test(t)
}

/**
 * Resposta automatica do WhatsApp Business de quem escreve (no sistema do Dr.
 * Marcello, 09/10/2026): "estou fora do meu horario de atendimento, retorno
 * assim que possivel" chegou em resposta a secretaria. Solta com uma IA, vira
 * duas maquinas conversando. Fica com o robo.
 */
export function respostaAutomaticaDaPessoa(texto: string): boolean {
  const t = semAcento(texto)
  return (
    /\bagradece (o |seu |o seu |pelo |pela sua )?(contato|mensagem)\b/.test(t) ||
    /\bagradec(o|emos) (imensamente |muito |sinceramente )?(o |seu |o seu |pelo |pela |pela sua )?(contato|mensagem)\b/.test(t) ||
    /\bseja (muito )?bem[- ]?vind[oa]/.test(t) ||
    /\bentraremos em contato\b/.test(t) ||
    /\b(retornaremos|responderemos) (o contato |sua mensagem |a sua mensagem )?(em breve|assim que|o mais breve)/.test(t) ||
    /\b(estou|estamos) fora do (meu |nosso )?horario de atendimento\b/.test(t) ||
    /\b(mensagem|resposta) automatica\b/.test(t) ||
    /\bretorno (sua mensagem|seu contato|o contato|a mensagem) (assim que|em breve|o mais breve)/.test(t) ||
    /\bresponderei (assim que|em breve|o mais breve)/.test(t)
  )
}

/**
 * "Urgente" sem sintoma numa conversa sobre papel (relatorio, laudo, receita).
 * O pedido pode ter vindo na mensagem anterior: "mas e urgente mesmo, a pericia
 * e sexta" nao fala do laudo.
 */
const PAPEL = /\b(relat[oó]rio|atestado|receita|laudo|declara[cç][aã]o|documento|papel|per[ií]cia|inss|formul[aá]rio)\b/i
const SINTOMA = /\b(febre|dor|doendo|vomit\w*|sangue|diarreia|passando mal|piorou|desmai\w*|convuls\w*|falta de ar|confus\w*|caiu)\b/i
function urgenciaDePapel(s: Situacao): boolean {
  const recentes = [...s.historico.filter((m) => m.de === 'pessoa').slice(-4).map((m) => m.texto), s.texto]
  if (recentes.some((t) => SINTOMA.test(t) || sinalDeAlarme(t))) return false
  return recentes.some((t) => PAPEL.test(t))
}

/** O pronto-socorro firme, a frase pronta do risco de vida. */
export const PRONTO_SOCORRO_AGORA = '🚨 Pelo que você contou, é preciso avaliação agora: procure o pronto-socorro mais próximo ou ligue 192 (SAMU), sem esperar a consulta.'
const RISCO_DE_VIDA = `${PRONTO_SOCORRO_AGORA}\n\nJá marquei a sua mensagem como urgente para a nossa equipe.`

/** O que fica com o robo mesmo com a IA ligada (ver o topo do arquivo). */
export function ficaComORobo(s: Situacao): string | null {
  // O risco de vida recebe a resposta pronta, a nao ser que ela ja tenha saido
  // na ultima mensagem nossa, ou que a pessoa ja esteja no pronto-socorro: ai a
  // IA, que le a conversa toda, responde o que ela perguntou. Vem antes da
  // equipe conversando, ao contrario da origem: "ela desmaiou" com a equipe na
  // conversa caia no silencio do robo, e "procure o pronto-socorro" e o que
  // qualquer pessoa da equipe diria. Vem antes do anexo tambem (no sistema do
  // Dr. Marcello, rodada 7: a foto com a legenda "olha o vomito, saiu com
  // sangue" recebia o texto padrao do anexo).
  if (sinalDeAlarme(s.texto)?.risco === 'vida' && !(s.ultimaDoConsultorio ?? '').includes(PRONTO_SOCORRO_AGORA) && !jaNoProntoSocorro(s)) return 'risco_de_vida'
  if (s.equipeConversando) return 'equipe_conversando'
  // "Urgente" de um papel pedido antes nao e urgencia de saude: fica com a IA.
  if (pediuUrgencia(s.texto) && !urgenciaDePapel(s)) return 'urgencia'
  if (s.anexo) return 'anexo'
  if (respostaAutomaticaDaPessoa(s.texto)) return 'resposta_automatica'
  // "Eu nao passei em consulta" (no sistema do Dr. Marcello, 23/10/2026): a IA
  // leu como pedido de marcar. O robo pede desculpas e chama a equipe.
  if (negouConsulta(s.texto)) return 'negou_consulta'
  return null
}

/**
 * A pessoa so fechou a conversa: emoji, risada, "perfeito", "ok, obrigada" (no
 * sistema do Dr. Marcello, 23/10/2026: a IA respondeu o 🥰 e depois o
 * "Perfeito", cada um com uma frase nova). So vale quando a nossa ultima
 * mensagem NAO perguntou nada: depois de "quer que eu abra o pedido?",
 * "perfeito" e um sim.
 */
export function soFechamento(texto: string): boolean {
  const t = texto.trim()
  if (!t) return false
  if (!/[\p{L}\p{N}]/u.test(t)) return true
  const sem = semAcento(t).replace(/[^a-z]/g, '')
  if (/^(k{3,}|(ha){2,}h?|(rs){1,}|(he){2,})$/.test(sem)) return true
  return soAgradecimento(t)
}

export function fechouSemPergunta(s: Situacao): boolean {
  if (!s.ultimaDoConsultorio || s.ultimaDoConsultorio.includes('?')) return false
  return soFechamento(s.texto)
}

const ATE = 4

/**
 * "Falar com a equipe" sem dizer o assunto (no sistema do Dr. Marcello,
 * 20/10/2026). O toque no menu ia direto para a fila e para os celulares, e
 * muitas vezes era para perguntar o valor ou o endereco. Agora o pedido sem
 * assunto ouve esta pergunta, e a mensagem seguinte vai para a IA, que resolve
 * ou chama a equipe com o assunto ja dito. Pedir de novo logo depois e insistir.
 */
export const ESPERA_DO_ASSUNTO =
  'Claro! Me conta aqui o que você precisa. Se eu conseguir resolver, já te respondo na hora; ' +
  'se for algo que precisa da equipe, eu passo para ela, que responde por aqui.'
const TRECHO_DA_ESPERA = 'Se eu conseguir resolver, já te respondo na hora'

const SO_PEDIU_A_EQUIPE =
  /^(?:atendente|secretaria|equipe|ajuda|(?:quero |queria |preciso |gostaria de )?falar com (?:a |o |uma |um |alguem da |alguem |algum )?(?:equipe|atendente|secretaria|alguem|pessoa|humano)(?: da equipe| da clinica| do consultorio)?)[.!]*$/

export const EQUIPE_DEPOIS_DA_ESPERA = 'Combinado! Já passei sua conversa para a equipe, que responde por aqui.'

export function esperarOAssunto(p: {
  texto: string
  titulo?: string | null
  etapa: string | null
  ultimaDoConsultorio: string | null
  equipeConversando: boolean
}): 'esperar' | 'equipe' | null {
  if (p.equipeConversando || p.etapa === 'atendente') return null
  const ultima = semAcento(p.ultimaDoConsultorio ?? '')
  if (!soPediuAEquipe(p.texto, p.titulo, ultima)) return null
  return ultima.includes(semAcento(TRECHO_DA_ESPERA)) ? 'equipe' : 'esperar'
}

function soPediuAEquipe(texto: string, tituloDoToque: string | null | undefined, ultima: string): boolean {
  const t = semAcento(texto).trim()
  const titulo = semAcento(tituloDoToque ?? '').trim()
  if (SO_PEDIU_A_EQUIPE.test(t) || SO_PEDIU_A_EQUIPE.test(titulo)) return true
  // O 9 chama a equipe em qualquer etapa (ver pediuAtendente). Outro numero so
  // quando a nossa ultima mensagem o oferecia para isso ("*3* Falar com alguem
  // da equipe", no menu).
  if (t === '9') return true
  const numero = /^(\d)$/.exec(t)?.[1]
  return Boolean(numero && new RegExp(String.raw`\*${numero}\*[^\n]*falar com`).test(ultima))
}

/**
 * Menu escrito a mao e eco da pergunta (no sistema do Dr. Marcello, primeiro
 * teste real, 15/10/2026). A instrucao pede para nao fazer; estas travas
 * garantem, porque o modelo nem sempre obedece.
 */
export function menuEscritoAMao(t: string): boolean {
  // A meia-risca que o modelo usa em "1 - opcao" vai como codigo (u2013):
  // o caractere nao entra em arquivo deste projeto. O mesmo para o emoji de tecla.
  const itens = t.split('\n').filter((l) => /^\s*[*_]*\s*(\d{1,2}\s*[).:\-\u2013]|\d\uFE0F?\u20E3)/.test(l)).length
  return itens >= 3 || /respond[ae]\s+com\s+(o\s+|um\s+)?n[uú]mero/i.test(t)
}

// "Dra." nao termina frase: sem isso o eco cortava em "Voce perguntou se a Dra."
const ABREVIADO = String.raw`\b(?:Dr|Dra|Sr|Sra|Prof|Profa)\.`
const ECO = new RegExp(
  String.raw`^((?:oi|ol[aá]|bom dia|boa tarde|boa noite)[!,.]*\s*)?(?:voc[eê]\s+(?:me\s+)?pergunt(?:ou|a)|sua\s+pergunta\s+(?:[eé]|foi))(?:${ABREVIADO}|[^.!?\n])*[.!?]?\s*`,
  'i',
)
// O ponto de "Dra.", "R." e "Av." nao fecha frase (no sistema do Dr. Marcello,
// rodadas 5 e 10: "Imagina! O Dr." sobrou sozinho, e o endereco partiu em "R.").
const FIM_DE_FRASE = /(?<!\b(?:Dr|Dra|Sr|Sra|Prof|Profa|R|Av|Al|Ed)\.)(?<=[.!?])\s+/
const PRONTO_SOCORRO = /pronto[\s-]?socorro|\b192\b|\bsamu\b|\bupa\b|\bhospital\b/i

/**
 * O texto para a pessoa que veio numa ferramenta. Aceita o nome com erro de
 * digitacao ("para_pesoa", e o "para_familia" do sistema de origem): no sistema
 * do Dr. Marcello a IA errou o campo uma vez e o texto sumiu sem aviso, com o
 * valor da consulta dentro.
 */
function campoParaPessoa(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const certo = input.para_pessoa
  if (typeof certo === 'string') return certo
  const parecido = Object.entries(input).find(([chave, valor]) => /^para_(pes|pac|fam)/i.test(chave) && typeof valor === 'string')
  if (parecido) console.warn('Atendente com IA mandou o texto da pessoa num campo com outro nome', parecido[0])
  return parecido ? String(parecido[1]) : ''
}

/**
 * Passo em que a pessoa escreve um dado (nome, nascimento, endereco,
 * restricao, o remedio da 2a via): o robo grava o que chegar, entao a IA so
 * pode mandar palavras que a pessoa escreveu (no sistema do Dr. Marcello,
 * rodada 6: a IA mandou "Sao Paulo" no passo do nome e a paciente foi gravada
 * assim).
 */
const PASSO_DE_DADO = /^(dados_(nome|nascimento|responsavel)|pedido_(nome|nascimento|restricao|quando)|visita_(nome|nascimento|endereco|restricao|quando)|documento_(item|exigencia|farmacia))$/
function passoDeDado(s: Situacao): boolean {
  return PASSO_DE_DADO.test(s.etapa ?? '')
}

/** O passo do valor: a pessoa le o preco e toca em "Entendi, seguir" (ver perguntarValor). */
function passoDoValor(s: Situacao): boolean {
  return /_valor$/.test(s.etapa ?? '')
}

/**
 * A pessoa aceitou o valor com as proprias palavras? So entao a IA pode mandar
 * "seguir" no passo do valor. Pergunta, "mas" ou "nao" junto nao e aceite.
 */
function aceitouOValor(texto: string): boolean {
  const t = semAcento(texto)
  if (/\?|\bmas\b|\b(nao|n)\b|\bduvida\b|\bcaro\b|\bdesconto\b|\bparcel/.test(t)) return false
  return /\b(entendi|pode seguir|seguir|segue|tudo bem|ta bom|certo|combinado|ok|sim|concordo|tranquilo|beleza|vamos|pode ser)\b/.test(t)
}

/** A pessoa ja contou um sinal de alarme, ou pediu urgencia, nesta conversa. */
function conversaDeUrgencia(s: Situacao): boolean {
  if (s.urgenciaAberta) return true
  return s.historico.some((m) => m.de === 'pessoa' && (Boolean(sinalDeAlarme(m.texto)) || pessoaFalouDeUrgencia(m.texto)))
}

/**
 * A pessoa disse que vai pensar: o lembrete "e so responder a pergunta acima"
 * depois disso soa como cobranca. Quando ela voltar, o passo continua la.
 */
const ADIAMENTO = /\b(vou pensar|vo pensa|vou pensa|vo pensar|vou ver direitinho|depois (eu )?(vejo|marco|decido|falo|retorno)|mais tarde eu|vou conversar com|vou ver com|vou falar com (meu|minha|os|as))\b/
function adiou(s: Situacao): boolean {
  const recentes = [...s.historico.filter((m) => m.de === 'pessoa').slice(-3).map((m) => m.texto), s.texto]
  return recentes.some((t) => ADIAMENTO.test(semAcento(t)))
}

/** Sinal de risco de vida agora ou nas ultimas mensagens da pessoa. */
const ORDEM_DE_IR_AGORA = /\b(?:leve|levem|levar|lev[aá]-l[oa]|procure|procurem|procurar|v[aá]|vão|ir|ligue)\b[^.!?\n]{0,40}\bagora\b|\bagora\b[^.!?\n]{0,15}\b(?:leve|levem|procure|procurem|v[aá]|vão|ligue)\b|\bagora\s*:/i
function riscoDeVida(s: Situacao): boolean {
  const recentes = [...s.historico.filter((m) => m.de === 'pessoa').slice(-6).map((m) => m.texto), s.texto]
  if (recentes.some((t) => sinalDeAlarme(t)?.risco === 'vida')) return true
  // O pronto-socorro agora ja dito por nos, numa urgencia aberta, tambem conta;
  // so a frase com o pronto-socorro E o "agora", sem "se" na frente, e fora das
  // frases prontas (no sistema do Dr. Marcello, rodada 12: o aviso comum "Se
  // for uma emergencia..." ligava a trava, e a pessoa ouviu quatro vezes
  // "pronto-socorro agora").
  const frasePronta = /Pelo que você contou, é preciso avaliação agora|Não espere a consulta|Se piorou, não espere/
  return Boolean(s.urgenciaAberta) &&
    s.historico
      .filter((m) => m.de === 'consultorio')
      .slice(-4)
      .some((m) => !frasePronta.test(m.texto) && m.texto.split(FIM_DE_FRASE).some((f) => PRONTO_SOCORRO.test(f) && ORDEM_DE_IR_AGORA.test(f) && !/^\s*(?:🚨\s*)?\*?se\b/i.test(f)))
}

// Oferta de marcar, que nao cabe numa conversa de risco de vida (no sistema do
// Dr. Marcello, rodada 7: a consulta de amanha virou motivo para esperar).
const OFERTA_DE_MARCAR = /\b(quer que eu (veja|procure|marque|abra)|posso (ver|procurar|marcar|abrir)|quer marcar|vamos marcar|pedido de consulta|pedir a consulta|marcar uma consulta|hor[aá]rio mais pr[oó]ximo|pr[oó]ximo hor[aá]rio|continua marcada|eu marco|d[aá] (?:sim )?para marcar)\b|(?:^|\s)[àa]s\s+\d{1,2}[:h]\d{2}\b|R\$\s*\d/i
/** A pessoa ja foi, esta ou esta indo ao pronto-socorro (nas ultimas mensagens). */
function jaNoProntoSocorro(s: Situacao): boolean {
  const recentes = [...s.historico.filter((m) => m.de === 'pessoa').slice(-3).map((m) => m.texto), s.texto]
  return recentes.some((t) =>
    /(?<!\b(?:nao|n)\s+(?:quero|vou|vo|consigo|posso|da pra|vamos)\s+)\b(voltamos|voltei|ja fomos|fomos|fui|ja fui|estamos|estou|to|tamo|tamos|saindo|indo|levei|levamos|levando|levar|leva)\b[^.!?\n]{0,25}\b(ps|pronto[\s-]?socorro|hospital|upa)\b/i.test(semAcento(t)) ||
    /\bvolt\w*(?:\s+\S+){0,2}?\s+(?:d[oa]s?|de)\s+(?:ps|pronto[\s-]?socorro|hospital|upa)\b/i.test(semAcento(t)) ||
    /\b(ja )?(to|estou|tamo|estamos) saindo\b/i.test(semAcento(t)) ||
    /\b(?:ja\s+)?(?:tamo|tamos|estamos|to|estou)\s+(?:de|d)\s+volta\b/i.test(semAcento(t)) ||
    /\b(vou|vamos|vamo|vo|to|estou|estamos|tamo|tamos)\s+(levar|leva|levando|indo)\b[^.!?\n]{0,15}\b(agora|agr)\b|\b(vamos|vamo) (agora|agr)\b|\bja (vou|estou indo|to indo)\b/i.test(semAcento(t)) ||
    /\b(samu)\b[^.!?\n]{0,20}\b(chegou|esta aqui|ta aqui|levou|levando|a caminho)\b|\b(chamei|chamamos|liguei|ligamos)\s+(o\s+|pro\s+|para o\s+)?(samu|192)\b/i.test(semAcento(t)) ||
    /\b(voltamos|voltei|ja voltamos|acabamos de voltar|acabou de voltar|chegamos|cheguei)\b[^\n]{0,120}\b(deram|deu|fizeram|tomou|liberaram|liberou|mandaram (?:p|pra|para) casa|alta|soro|medicaram|pediram)\b/i.test(semAcento(t)),
  )
}

/**
 * Risco de vida: sai do texto da IA tudo o que aceita esperar (no sistema do
 * Dr. Marcello, rodada 10, critica: "entao amanha a gente ve com ele" recebeu o
 * pronto-socorro na frente e, embaixo, "descansem bem"). Condicional, "qualquer
 * coisa", despedida de boa noite e a consulta como plano.
 */
const ACEITA_ESPERAR =
  /^\s*(?:🚨\s*)?se\b|\bse\s+(?:ela|ele|o paciente|a paciente|sua m[aã]e|seu pai|piorar|vomitar|tiver|ficar)\b|\bqualquer coisa\b|\bdescans\w*|\bdurm\w*|\bboa noite\b|\bat[eé] amanh[aã]\b|\bamanh[aã]\b[^.!?\n]{0,40}\b(?:consulta|v[eê]|ver|avalia)\w*|\bconsulta\b[^.!?\n]{0,40}\b(?:confirmad|marcad|mantid|continua)\w*/i
function semEsperar(t: string): string {
  return t
    .split('\n')
    .map((linha) => linha.split(FIM_DE_FRASE).filter((f) => !ACEITA_ESPERAR.test(f)).join(' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
/** A pessoa diz que vai esperar ("amanha a gente ve", "vou deixar ela dormir"). */
function vaiEsperar(s: Situacao): boolean {
  return /\bamanh[aã]\b|\bdescans\w*|\bdorm\w*|\besperar\b|\bespero\b|\bconsulta\b|\bmarca\b/i.test(s.texto)
}
function comProntoSocorroAgora(t: string, s?: Situacao): string {
  const limpo = semEsperar(t)
  const abertura = s && vaiEsperar(s)
    ? '🚨 Não espere a consulta: pelo que você contou, é preciso avaliação agora. Procure o pronto-socorro mais próximo ou ligue 192 (SAMU).'
    : PRONTO_SOCORRO_AGORA
  const firme = limpo.split(/\n|(?<=[.!?])\s+/).some((f) => PRONTO_SOCORRO.test(f) && /\bagora\b/i.test(f))
  return firme ? limpo : [abertura, limpo].filter(Boolean).join('\n\n')
}
function semOfertaDeMarcar(t: string): string {
  return t
    .split('\n')
    .map((linha) => linha.split(FIM_DE_FRASE).filter((frase) => !OFERTA_DE_MARCAR.test(frase)).join(' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// "Nao e urgencia, so queria saber..." nao e falar de urgencia: a palavra solta
// deixava o pronto-socorro no fim de uma duvida comum.
function pessoaFalouDeUrgencia(texto: string): boolean {
  if (PRONTO_SOCORRO.test(texto) || pediuUrgencia(texto)) return true
  return /emerg[eê]ncia/i.test(texto) && !/\b(n[aã]o|nem|sem)\b[^.!?\n]{0,15}emerg/i.test(texto)
}

/**
 * Tira as frases que o consultorio acabou de dizer (no sistema do Dr.
 * Marcello, 16/10/2026: "vou pensar" e depois "boa noite" receberam o MESMO
 * lembrete, um minuto depois). Se sobrar nada, vale o texto inteiro.
 */
function palavrasDaFrase(frase: string): Set<string> {
  return new Set(
    frase
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length > 2),
  )
}

/** Dois recados que dizem quase a mesma coisa (mais da metade das palavras em comum). */
function quaseIgual(a: string, b: string): boolean {
  const pa = palavrasDaFrase(a)
  const pb = palavrasDaFrase(b)
  if (pa.size === 0 || pb.size === 0) return false
  let comuns = 0
  for (const p of pa) if (pb.has(p)) comuns++
  return comuns / Math.min(pa.size, pb.size) >= 0.6
}

export function semRepetir(texto: string, anterior: string | null | undefined): string {
  if (!anterior?.trim()) return texto
  const ditas = anterior
    .split(/\n+/)
    .flatMap((linha) => linha.split(FIM_DE_FRASE))
    .map(palavrasDaFrase)
    .filter((p) => p.size >= 5)
  const repetida = (frase: string) => {
    const nova = palavrasDaFrase(frase)
    if (nova.size < 5) return false
    return ditas.some((velha) => {
      let comuns = 0
      for (const p of nova) if (velha.has(p)) comuns++
      return comuns / Math.max(nova.size, velha.size) >= 0.7
    })
  }
  const limpo = texto
    .split('\n')
    .map((linha) => linha.split(FIM_DE_FRASE).filter((frase) => !repetida(frase)).join(' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return limpo || texto
}

/**
 * O texto "para a pessoa" foi escrito para a equipe? (no sistema do Dr.
 * Marcello, 16/10/2026: "A familia do [paciente] pergunta se e possivel pagar
 * presencialmente... Por favor, confirmem" saiu para a propria mae). O texto
 * vira nota interna e a pessoa recebe a frase padrao.
 */
const PARA_A_EQUIPE = [
  /\b(?:a|essa|esta)\s+(?:fam[ií]lia|pessoa|paciente|filha|filho|cuidador|cuidadora|neta|neto)\s+(?:pergunt|quer|pede|pediu|gostaria|precisa|solicit|est[aá]\s+pergunt)/i,
  /[Ff]am[ií]lia\s+d[aeo]\s+[A-ZÀ-Ý]/,
  // Sem "liguem" e "avisem": "procurem o pronto-socorro ou liguem 192" e para a pessoa.
  /\b(?:confirmem|respondam|verifiquem|retornem|chequem)\b/i,
  /\bpor favor,?\s+(?:confirm|respond|verifi)/i,
  /\b(?:o|a)\s+(?:respons[aá]vel|m[aã]e|pai|paciente|filha|filho|cuidador|cuidadora)\s+(?:pergunt|quer|pediu|pede|gostaria|precisa)/i,
]

export function falaComAEquipe(texto: string): boolean {
  return PARA_A_EQUIPE.some((r) => r.test(texto))
}

/**
 * O plano da IA nao vai para a pessoa (no sistema do Dr. Marcello, 17/10/2026,
 * rodada 2 do painel: o raciocinio "A familia aceitou marcar... entao abro o
 * agendamento" saiu em cinco de seis agendamentos). Sai a frase que fala DA
 * pessoa ou do que a IA vai fazer. A lista veio de catorze rodadas de painel;
 * cada linha guarda o caso de la.
 */
// Sem \b no fim: no JavaScript o "a" acentuado nao e letra para o \b.
const FIM = String.raw`(?![\wà-ú])`
const COMECA_PELA_PESSOA = /^\s*(?:(?:a|essa|esta)\s+(?:fam[ií]lia|m[aã]e|av[oó]|respons[aá]vel|pessoa|paciente|filha|cuidadora?)\s+(?!d[aeo]s?\b|d[aeo]\s)\S+|o\s+(?:usu[aá]rio|paciente|filho|cuidador)\b)/i
const NARRACAO = [
  /\bn[aã]o\s+(?:h[aá]|tenho|existe)\s+(?:nada\s+)?(?:o\s+)?(?:que|a)\s+acrescentar\b|\bnada\s+a\s+acrescentar\b|\bn[aã]o\s+(?:vou\s+)?escrev(?:o|er|erei)\s+nada\b/i,
  new RegExp(String.raw`\b(?:a|essa|esta)\s+(?:fam[ií]lia|pessoa|paciente)\s+(?:disse|aceitou|quer|escolheu|pediu|pede|pergunt\w*|n[aã]o|j[aá]|est[aá]|confirmou|respondeu|mandou|escreveu|tem|decidiu|procura\w*|vai)${FIM}`, 'i'),
  new RegExp(String.raw`\b(?:a|o)\s+(?:m[aã]e|pai|av[oó]|respons[aá]vel|filha|filho|cuidador|cuidadora)\s+(?:disse|aceitou|quer|escolheu|pediu|pede|pergunt\w*|n[aã]o|j[aá]|est[aá]|confirmou|respondeu|mandou|escreveu|tem|decidiu|procura\w*|vai)${FIM}`, 'i'),
  new RegExp(String.raw`\b(?:ela|ele)\s+(?:perguntou|escreveu|respondeu|quer saber|est[aá] dizendo|disse que)${FIM}`, 'i'),
  COMECA_PELA_PESSOA,
  /\bantes de qualquer texto\b|\bpreciso corrigir\b|\bo caminho [eé]\b|\bnada a acrescentar\b|\bsem ferramenta\b|\bprecisa ser chamad[ao]\b|\btenho que responder\b|\bresposta (?:[eé] )?curta\b|\breavis\w*|\bcorrijo\b/i,
  /\bpiora (?:nova )?contada\b|\bpessoa concordou\b|\brefor[cç]o curto\b|\bposso orientar que\b|\bna tela\b/i,
  /\bn[aã]o vou (?:chamar|acionar|avisar|opinar|oferecer|insistir|pressionar)\b|\bporta aberta\b|\bsem pressionar\b|\bseria conduta\b|\bn[aã]o h[aá] sinal de urg[eê]ncia\b|\bprocurando atendimento\b/i,
  /\ba pergunta d[aeo]\s+\S+\s+[eé]\b|\b(?:ao|do|no|pelo|o)\s+sistema\b|\bantes de responder\b|\bpreciso apenas\b|\bn[aã]o devo\b|\b(?:usar|chamar) (?:a )?ferramenta\b|^\s*aten[cç][aã]o\s*:/i,
  /\bvou responder\b|\bvale refor[cç]ar\b|\bn[aã]o [eé] (?:o )?caso de\b|\bn[aã]o [eé] conduta\b|\b(?:a\s+)?(?:fam[ií]lia|pessoa)\s+parece\b|\b(?:a\s+)?(?:m[aã]e|filha|paciente)\s+parece\b/i,
  /\bpelo contexto\b|\bretomar o passo\b|\bpasso em aberto\b|\betapa a enviar\b|\brespondo em texto\b|\b(?:ela|ele)\s+est[aá]\s+confus[ao]\s+(?:sobre|com)\b|\bpela [uú]ltima mensagem\b|\b(?:ela|ele)\s+pediu\b|\bpreciso responder\b|\blembro o passo\b/i,
  /\b(?:abrir_fluxo|responder_etapa|ver_horarios|chamar_equipe|fluxo)\b/i,
  /\ba conversa j[aá] (?:definiu|combinou|tem)\b/i,
  /\bent[aã]o (?:abro|vou abrir|chamo|vou chamar|passo)\b/i,
  /\b(?:abro|abrirei) o (?:agendamento|pedido)\b/i,
  /\bvou abrir o (?:agendamento|pedido) direto\b/i,
  /\bdevo\s+(?:orientar|chamar|abrir|usar|oferecer|responder|mandar|passar|consultar|dizer|seguir|registrar|tratar|manter|repetir|perguntar|acionar)\b/i,
  /\bdevo\s+[a-zà-ú]+(?:ar|er|ir)\b|\bseria redundante\b|\bpor mim\b|\bn[aã]o [eé] urg[eê]ncia\s*\(|\bo usu[aá]rio\b|\bpreciso (?:consultar|checar|verificar|olhar)\b|\bpreciso (?:confirmar|ver) a agenda\b|\bvou (?:consultar|checar|verificar|olhar) a agenda\b|\brisco de vida descrito\b|\bsem oferecer\b/i,
  // Conta de valores que a IA monta: fica so o valor escrito.
  /R\$\s*[\d.,]+\s*(?:[+=]|\bmais\b|\bsomando\b|\bacrescid\w* de\b)\s*R\$|R\$\s*[\d.,]+[^.!?\n]{0,30}\bou seja\b[^.!?\n]{0,10}R\$/i,
  /^\s*>?\s*\**\s*corre[cç][aã]o\s*\**\s*:|\bn[aã]o h[aá] soma\b/i,
  /\bpelas? regras?\b|\bsem (?:a )?ferramenta\b|\bpergunta hipot[eé]tica\b|\bn[aã]o chama (?:a )?equipe\b|\ba resposta [eé] direta\b/i,
  /^\s*(?:A|O)\s+[A-ZÀ-Ú][a-zà-ú]+\s+(?:est[aá] dizendo|disse que|quer saber|perguntou|pediu|escreveu|parece)\b/,
  /\bvou confirmar a consulta\b|\bmanter o pronto[\s-]?socorro\b|\bapenas como orienta[cç][aã]o\b|\bdizer que a equipe\b/i,
  /^\s*respond[ao]\s+diretamente\b|\bresponder diretamente\b/i,
  /\bn[aã]o (?:preciso|[eé] preciso|h[aá] (?:por)?que)\s+(?:chamar|abrir|usar|consultar|oferecer|passar|orientar|repetir|avisar|acionar)\b/i,
  /^(?![^\n]*\bvoc[eê](?![a-zà-ú]))[^\n]*(?<!\baqui mesmo |\baqui |\bpor aqui )\bnesta conversa\b/i,
  /\bpela regra\b/i,
  /\b(?:ent[aã]o|s[oó]|apenas|aqui)\s+respondo\b|\brespondo\s+(?:s[oó]|apenas|que|com|a d[uú]vida)\b/i,
  /\bposso adaptar\b/i,
  new RegExp(String.raw`\bo sistema\s+(?:j[aá]${FIM}|vai\b|mostr\w*|mand\w*|le[uo]\b|entend\w*|interpret\w*|registr\w*|segu\w*|abr\w*)`, 'i'),
  // As marcas internas das instrucoes nunca vao para a pessoa.
  /<\/?(?:clinica|contexto|conversa|mensagem_nova)>/i,
  // Chamada de ferramenta escrita como texto (o JSON cru chegou a mae, la).
  /[{"]\s*"?(?:motivo|para_pessoa|para_familia|resumo_para_equipe|fluxo)"?\s*:/,
  /<\/?(?:parameter|invoke|function_calls|antml)\b/i,
  /\b(?:agora )?vou abrir\b/i,
  /\ba tela\b/i,
  /^\s*(?:sim|n[aã]o)[,!]\s+(?![^?]*\b(?:quer|posso|prefere|gostaria|pode ser|que tal|voc[eê]|te)\b)[^.!?\n]{3,80}\?\s*$/i,
]

export function semNarracao(texto: string): string {
  // Pergunta e resposta da propria IA: sai a pergunta, fica a resposta.
  const semAutoPergunta = texto
    .replace(/R\$\s*[\d.,]+\s*(?:…|\.{2,3}|,)\s*(?:desculp\w*|perd[aã]o|corrigindo)[,!.]?\s*(?:o valor (?:correto|certo) [eé]\s*)?(?=R\$)/gi, '')
    .replace(
      /(^|[.!?]\s+|\n)[^.!?\n]*\?\s+(?:N[aã]o|Sim|Corrigindo)\s*:\s*(\S)/g,
      (_, antes: string, letra: string) => antes + letra.toUpperCase(),
    )
    .replace(
      /(^|[.!?]\s+|\n)[^.!?\n]*R\$[^.!?\n]*\?\s+(?:N[aã]o|Na verdade)\s*[,.]\s*(\S)/g,
      (_, antes: string, letra: string) => antes + letra.toUpperCase(),
    )
  // Paragrafo com duas frases de rascunho ou mais sai inteiro: o raciocinio vem
  // em bloco. Frase que comeca falando da pessoa na terceira pessoa marca o
  // paragrafo inteiro como rascunho quando ha outro paragrafo para ela.
  const paragrafos = semAutoPergunta.split('\n')
  const deTerceiros = (linha: string) => linha.split(FIM_DE_FRASE).some((frase) => COMECA_PELA_PESSOA.test(frase))
  const temOutro = paragrafos.filter((linha) => linha.trim() && !deTerceiros(linha)).length > 0
  const linhas = paragrafos.map((linha) => {
    if (temOutro && deTerceiros(linha)) return ''
    const frases = linha.split(FIM_DE_FRASE)
    const rascunho = frases.filter((frase) => NARRACAO.some((r) => r.test(frase)))
    if (rascunho.length >= 2) return ''
    return frases.filter((frase) => !rascunho.includes(frase)).join(' ')
  })
  const limpo = linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (limpo !== texto.trim()) console.warn('Atendente com IA narrou o plano no texto da pessoa; cortado', texto.slice(0, 200))
  return limpo
}

const AVISO_PADRAO = 'Vou confirmar isso com a equipe e te respondemos por aqui.'

// A IA diz que a equipe confirma, num texto sem ferramenta (no sistema do Dr.
// Marcello, rodada 8: a pergunta ficava sem resposta e sem nota). Frase que
// aponta outro dono da resposta (plano, a Dra., a consulta) nao conta.
const PROMETEU_A_EQUIPE =
  /\b(?:vou|vamos|irei|vale|melhor|pode|posso)\s+(?:\w+\s+){0,2}(?:confirmar|verificar|checar|conferir|perguntar|consultar|passar|avisar|encaminhar|repassar)\b[^.!?\n]{0,40}\b(?:equipe|secret[aá]ria|recep[cç][aã]o)\b|\ba equipe (?:confirma|verifica|retorna)\b|\bn[aã]o (?:sei (?:te )?(?:dizer|informar|responder)|tenho (?:essa|esta|a|como (?:saber|confirmar)) informa[cç][aã]o|tenho essa resposta|consigo (?:te )?confirmar)\b/i
const OUTRO_DONO = /\b(?:unimed|plano|conv[eê]nio|contrato|operadora|m[eé]dica|m[eé]dico|consulta|doutora|doutor|normal|grave)\b|\bDra?\./i
function prometeuAEquipe(texto: string): boolean {
  return texto
    .split('\n')
    .flatMap((linha) => linha.split(FIM_DE_FRASE))
    .some((frase) => PROMETEU_A_EQUIPE.test(frase) && !(OUTRO_DONO.test(frase) && !/\bequipe\b/i.test(frase)))
}

/**
 * O que nenhuma ferramenta faz (no sistema do Dr. Marcello, rodadas 7 a 14):
 * "vou anotar", "te aviso se abrir vaga", "deixo reservado", "a Dra. ja sabe".
 * Aqui tambem a vaga "garantida": com a agenda por pedido, nada esta garantido
 * antes de a Dra. confirmar. A frase sai do texto que vai para a pessoa.
 */
const PROMESSA =
  /\b(?:vou|irei|vamos)\s+(?:te\s+|lhe\s+)?(?:anotar|registrar|reservar|segurar|guardar|lembrar|avisar(?!\s+a\s+equipe)|mandar|enviar)\b|\b(?:anotei|registrei|reservei|guardei|segurei)\b|\bte\s+(?:aviso|lembro|mando|envio)\b|\bdeixo\s+(?:reservad|separad|anotad|guardad)\w*|\beu\s+(?:troco|mudo|altero|remarco|ajusto)\b|\b(?:j[aá]\s+)?pe[cç]o\s+(?:a\s+)?(?:troca|mudan[cç]a|altera[cç][aã]o)\b|\bvou\s+(?:pedir|solicitar)\s+(?:a\s+)?(?:troca|mudan[cç]a|altera[cç][aã]o)\b|\bvou\s+(?:trocar|mudar|remarcar|alterar)\b|\bj[aá]\s+deixo\b|\beu\s+(?:mesm[oa]\s+)?marco\b|\bmarco para voc[eê]|\bo combinado [eé]\b|\bassim que\b[^.!?\n]{0,30}\bficar pront|\bte mandar por aqui\b|\bvou\s+(?:procurar|ver\s+as\s+datas|buscar)\b|\b(?:a gente|eu|n[oó]s)\s+deix\w*\s+(?:marcad|reservad|agendad)\w*|\bvou deixar\b[^.!?\n]{0,30}\b(?:agendamento|pedido|marcad|reservad|aberto|anotad|encaminhad|selecionad|separad|escolhid)\w*|\b(?:o|a)\s+Dra?\.\s+\S+\s+(?:j[aá]\s+)?sabe\b|\b(?:vaga|hor[aá]rio|consulta)\s+(?:j[aá]\s+)?(?:est[aá]|fica|ficou)\s+(?:garantid|reservad)\w*|\b(?:j[aá]\s+)?recebi\b[^.!?\n]{0,40}\b(?:dados|em cima|que voc[eê] mandou)|\b(?:dados|que voc[eê] mandou)\b[^.!?\n]{0,40}\bj[aá] recebi\b/i
function semPromessa(t: string): string {
  return t
    .replace(/\s+e\s+(?:para|pra)\s+a\s+Dra\.\s+[A-ZÀ-Ú][\wà-ú]+/g, '')
    .replace(/^\s*(?:combinado|fechado|pode deixar|beleza|certinho)\s*[!.,]\s*(?=\S)/i, '')
    .replace(/^\s*\p{Ll}/u, (letra) => letra.toUpperCase())
    .split('\n')
    .map((linha) => linha.split(FIM_DE_FRASE).filter((frase) => !PROMESSA.test(frase)).join(' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Convenio que a IA prometeu (porte de 28/10/2026). A consulta e particular, e
 * o caso que puxou o passo do valor foi justamente o de 19/10/2026: um
 * paciente atendido achando que era pelo plano. Frase que diz que a Dra.
 * atende, aceita ou cobre convenio sai; a que fala de reembolso, ou que nega o
 * convenio, fica. Se sobrar nada, a frase certa. Vale enquanto nenhum
 * atendimento tiver convenio cadastrado (ver clinicaAtendeConvenio).
 */
// O verbo perto do nome do plano: "atendemos particular e emitimos recibo para
// reembolso do plano" fala de reembolso, e fica.
const NOME_DE_CONVENIO = String.raw`(?:conv[eê]nios?|planos? de sa[uú]de|plano|planos|unimed|amil|bradesco(?: sa[uú]de)?|sulam[eé]rica|porto seguro|hapvida|notredame|prevent senior|golden cross|omint|care ?plus|cassi|cabesp|geap|iamspe)`
const PROMETE_CONVENIO = new RegExp(
  String.raw`\b(?:atend\w*|aceit\w*|trabalh\w*\s+com|credenciad\w*|conveniad\w*)\b[^.!?\n]{0,25}\b${NOME_DE_CONVENIO}\b` +
    String.raw`|\b${NOME_DE_CONVENIO}\b[^.!?\n]{0,20}\b(?:cobre|cobrem|aceit[oa]|atendid[oa]|credenciad\w*)\b` +
    String.raw`|\b(?:consulta|atendimento|visita)\b[^.!?\n]{0,25}\bpel[oa]\s+(?:seu\s+|sua\s+)?${NOME_DE_CONVENIO}\b`,
  'i',
)
const NEGA_CONVENIO = /\b(n[aã]o|nem|sem|nenhum|nenhuma)\b/i
export const SO_PARTICULAR = 'A consulta é particular, sem convênio.'
export function semConvenioPrometido(texto: string): string {
  let cortou = false
  const limpo = texto
    .split('\n')
    .map((linha) =>
      linha
        .split(FIM_DE_FRASE)
        .filter((frase) => {
          const promete = PROMETE_CONVENIO.test(frase) && !NEGA_CONVENIO.test(frase)
          if (promete) cortou = true
          return !promete
        })
        .join(' '),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!cortou) return texto
  console.warn('Atendente com IA disse que a consulta e pelo convenio; frase cortada', texto.slice(0, 200))
  return limpo ? `${limpo}\n\n${SO_PARTICULAR}` : SO_PARTICULAR
}

/** Algum atendimento tem convenio cadastrado? (ver conhecimentoDaClinica) */
function clinicaAtendeConvenio(conhecimento: string): boolean {
  return /^Convênio: (?!não atende)/m.test(conhecimento)
}

/**
 * A pessoa perguntou o preco, e nos ainda nao dissemos (no sistema do Dr.
 * Marcello, rodada 12: o valor saia de novo pela terceira vez).
 */
function valorPedidoENaoDito(s: Situacao): boolean {
  const PRECO = /\b(quanto (?:custa|e|é|fica|sai|ta|tá)|quanto [eé] a consulta|qnto|qto|qual (?:e |é )?o valor|valor da consulta|pre[cç]o)\b/i
  const ultimas = s.historico.slice(-4)
  const ultimaDaPessoa = [...ultimas].reverse().find((m) => m.de === 'pessoa')?.texto ?? ''
  const precoPerguntado = PRECO.test(s.texto) || PRECO.test(ultimaDaPessoa)
  const jaDissemos = ultimas.some((m) => m.de === 'consultorio' && /R\$/.test(m.texto))
  return precoPerguntado && !jaDissemos
}

const AVISO_DE_URGENCIA = 'Se for uma emergência com risco de vida, procure o pronto-socorro mais próximo ou ligue 192.'

/**
 * O Claude deu conduta numa mensagem com sintoma? (no sistema do Dr. Marcello,
 * 16/10/2026). A instrucao proibe, mas e a unica coisa que nao pode escapar:
 * remedio, dose e "faca isso" sao da medica. Lista grosseira de proposito -
 * errar para o lado de chamar a equipe custa uma espera; deixar passar custa
 * uma pessoa idosa medicada pelo WhatsApp.
 */
const REMEDIO = String.raw`(dipirona|paracetamol|ibuprofeno|nimesulida|diclofenaco|omeprazol|pantoprazol|buscopan|tylenol|novalgina|dorflex|dramin|plasil|bromoprida|ondansetrona|vonau|simeticona|lactulose|aas|aspirina|insulina|losartana|captopril|enalapril|metformina|sinvastatina|atorvastatina|furosemida|hidroclorotiazida|anlodipino|clonazepam|rivotril|diazepam|alprazolam|zolpidem|prednisona|dexametasona|amoxicilina|azitromicina|cefalexina|marevan|varfarina|xarelto|eliquis)`
const CONDUTA = new RegExp(
  [
    String.raw`\b\d+([.,]\d+)?\s*(mg|ml|mcg|ui|gotas?|comprimidos?|c[aá]psulas?|sach[eê]s?)\b`,
    String.raw`\bde\s+\d+\s+em\s+\d+\s*(h|horas)\b`,
    String.raw`\b(dose|posologia|dosagem)\b`,
    String.raw`\b(pode|podem|deve|devem)\s+(dar|tomar|oferecer|aplicar|suspender|parar|aumentar|diminuir)\b`,
    String.raw`\b(d[eê]|ofere[cç]a|suspenda|aplique|use|tente|tome|aumente|diminua|reduza|pare)\s+(a\s+ele|a\s+ela|pra\s+ele|pra\s+ela|um|uma|o|a|os|as)?\s*(rem[eé]dios?|medica[cç][aã]o|medicamentos?|xarope|soro|antit[eé]rmico|ch[aá])(?![a-zà-ú])`,
    String.raw`\b${REMEDIO}\b`,
    // Mandar NAO dar tambem e conduta: so a medica pode mandar suspender ou esperar.
    String.raw`\bn[aã]o\s+(d[eê]|deem|ofere[cç]a|fa[cç]a)\s+nada\b`,
    String.raw`\bn[aã]o\s+(d[eê]|deem|ofere[cç]a|tome)\s+(o\s+|a\s+|os\s+|as\s+)?(rem[eé]dios?|medica[cç][aã]o|medicamentos?)\b`,
    String.raw`\bnada\s+(pela|por)\s+boca\b`,
  ].join('|'),
  'i',
)

/**
 * A frase que RECUSA a conduta nao e conduta (no sistema do Dr. Marcello,
 * 17/10/2026: "sobre o paracetamol, quem orienta e o Dr." foi trocado pela
 * frase padrao e a conversa saiu da urgencia). Frase com recusa sai da
 * conferencia, a nao ser que tenha conduta firme.
 */
const RECUSA = new RegExp(
  [
    String.raw`\bquem\s+(orienta|indica|decide|avalia|define|prescreve|receita)\b`,
    String.raw`\bn[aã]o\s+(posso|consigo|podemos|conseguimos|d[aá]\s+(pra|para))\s+(te\s+|lhe\s+)?(orientar|indicar|recomendar|passar|dizer|informar|falar|prescrever|confirmar|liberar|sugerir)\b`,
    String.raw`\bn[aã]o\s+(oriento|indico|recomendo|prescrevo)\b`,
    String.raw`\bs[oó]\s(?:[^.!?\n]|\bDra?\.){0,40}\b(pode|podem|vai|v[aã]o|consegue)\s+(te\s+)?(orientar|indicar|avaliar|prescrever|liberar|dizer)\b`,
  ].join('|'),
  'i',
)
const CONDUTA_FIRME = new RegExp(
  [
    String.raw`\b\d+([.,]\d+)?\s*(mg|ml|mcg|ui|gotas?|comprimidos?|c[aá]psulas?|sach[eê]s?)\b`,
    String.raw`\bde\s+\d+\s+em\s+\d+\s*(h|horas)\b`,
    String.raw`(?<!\bse\s)(?<!n[aã]o\s)\b(pode|podem|deve|devem)\s+(dar|tomar|oferecer|aplicar|suspender|parar|aumentar|diminuir)\b`,
    String.raw`\b(ajuda|ajudam|alivia|aliviam|resolve|melhora|funciona|costuma|indicad[oa]|recomendad[oa]|seguro|segura)\b`,
    String.raw`\bn[aã]o\s+(d[eê]|deem|ofere[cç]a|fa[cç]a)\s+nada\b`,
    String.raw`\bn[aã]o\s+(d[eê]|deem|ofere[cç]a|tome)\s+(o\s+|a\s+|os\s+|as\s+)?(rem[eé]dios?|medica[cç][aã]o|medicamentos?)\b`,
  ].join('|'),
  'i',
)

export function orientouConduta(t: string): boolean {
  const semRecusas = t
    .split('\n')
    .flatMap((linha) => linha.split(FIM_DE_FRASE))
    .filter((frase) => !(RECUSA.test(frase) && !CONDUTA_FIRME.test(frase)))
    .join(' ')
  return CONDUTA.test(semRecusas)
}

export function limparTexto(t: string, manterProntoSocorro: boolean): string {
  // Negrito de site: o WhatsApp so entende um asterisco de cada lado.
  let r = t.replace(/\*\*([^*\n]+)\*\*/g, '*$1*').replace(/__([^_\n]+)__/g, '_$1_').replace(ECO, '')
  // Pronto-socorro so quando o Claude tratou como urgencia ou a pessoa tocou no
  // assunto. Em duvida comum, a frase assusta e nao ajuda.
  if (!manterProntoSocorro) {
    r = r
      .split('\n')
      .map((linha) => linha.split(FIM_DE_FRASE).filter((frase) => !PRONTO_SOCORRO.test(frase)).join(' '))
      .join('\n')
  }
  return r.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * A IA pensa antes de responder quando precisa ('adaptive', no sistema do Dr.
 * Marcello desde 23/10/2026): "obrigada" sai direto; duvida de conduta e pedido
 * ambiguo ganham raciocinio. O pensamento conta no max_tokens: dai o teto alto,
 * que so custa o que for usado. Se o prazo apertar, baixar o esforco para 'low'
 * antes de desligar o pensamento.
 */
export const PENSAMENTO = { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } } as const
export const TETO_DE_TOKENS = 8000

/** O texto que vai para a pessoa, com as travas que valem para todo caminho. */
function paraSair(t: string, s: Situacao, urgente: boolean): string {
  const limpo = semNarracao(limparTexto(t, urgente))
  return clinicaAtendeConvenio(s.conhecimento) ? limpo : semConvenioPrometido(limpo)
}

/**
 * Uma conversa com o Claude, ate ele dar a resposta final ou usar uma
 * ferramenta que encerra a vez (abrir_fluxo, responder_etapa, chamar_equipe).
 */
async function conversarComClaude(
  s: Situacao,
  ferramentas: Ferramentas,
  chamar: ChamarClaude,
  modelo: string,
  emEtapa: boolean,
  prazoMs: number,
): Promise<{ resultado: Resultado; acao: string; nota?: string }> {
  const fim = Date.now() + prazoMs
  const mensagens: Record<string, unknown>[] = [{ role: 'user', content: contexto(s) }]
  let vazias = 0
  for (let volta = 0; volta < ATE; volta++) {
    const resta = fim - Date.now()
    if (resta < 1500) throw new Error('prazo esgotado')
    const resposta = await chamar(
      {
        model: modelo,
        max_tokens: TETO_DE_TOKENS,
        ...PENSAMENTO,
        system: sistemaDoClaude(s, emEtapa),
        tools: ferramentasDoClaude(emEtapa),
        messages: mensagens,
      },
      resta,
    )
    const blocos = Array.isArray(resposta?.content) ? resposta.content : []
    const usos = blocos.filter((b): b is Extract<Bloco, { type: 'tool_use' }> => b.type === 'tool_use')
    const sintoma = relatoDeSintoma(s.texto)
    // Sintoma com o consultorio fechado, conversa ja de urgencia, ou "e se...
    // faco o que?" com sintoma: o pronto-socorro fica no texto. Em duvida comum, sai.
    const perguntaDoSe = /\bse\b[^?]{0,80}\b(fa[cç]o o (?:que|q)|fa[cç]o oq|o (?:que|q) eu fa[cç]o|oq eu fa[cç]o|levo (?:no|pro|ao|na) (?:ps|pronto|hospital|upa)|levo ou espero)\b/i.test(semAcento(s.texto))
    const urgente =
      usos.some((u) => u.name === 'chamar_equipe' && u.input?.motivo === 'urgencia') ||
      pessoaFalouDeUrgencia(s.texto) ||
      Boolean(sinalDeAlarme(s.texto)) ||
      (sintoma && !dentroDoExpediente(s.agora)) ||
      (sintoma && perguntaDoSe) ||
      conversaDeUrgencia(s)
    const bruto = blocos
      .filter((b): b is Extract<Bloco, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
      .slice(0, 1500)
    // Menu escrito a mao sai sem os botoes: vale o menu de verdade do sistema.
    if (!emEtapa && menuEscritoAMao(bruto) && !usos.some((u) => u.name === 'chamar_equipe')) {
      const menu = await ferramentas.robo(FLUXOS.menu.texto, FLUXOS.menu.etapa)
      if (menu) return { resultado: menu, acao: 'fluxo:menu' }
    }
    // Pergunta repetida se responde de novo: com pergunta, nada e cortado.
    const ultimaNossa = parecePergunta(s.texto)
      ? null
      : [...s.historico].reverse().find((m) => m.de === 'consultorio')?.texto
    const texto = paraSair(semRepetir(limparTexto(bruto, urgente), ultimaNossa), s, urgente)
    const pedidoAEquipe = usos.find((u) => u.name === 'chamar_equipe')?.input
    const avisoDaEquipe = pedidoAEquipe ? campoParaPessoa(pedidoAEquipe) || String(pedidoAEquipe.texto ?? '') : ''
    // A urgencia ganha de qualquer outra ferramenta da mesma resposta: perder a
    // chamada seria perder a etiqueta de urgencia.
    const final =
      usos.find((u) => u.name === 'chamar_equipe' && u.input?.motivo === 'urgencia') ??
      usos.find((u) => u.name === 'responder_etapa' && usos.some((o) => o.name === 'chamar_equipe' && o.input?.motivo !== 'urgencia')) ??
      usos.find((u) => u.name !== 'ver_horarios')
    // A trava confere o que vai SAIR para a pessoa: o rascunho nao sai.
    const vaiSair = !usos.length
      ? texto
      : final?.name === 'abrir_fluxo'
        ? campoParaPessoa(final.input)
        : final?.name === 'chamar_equipe'
          ? String(avisoDaEquipe ?? '').trim() || texto
          : final?.name === 'responder_etapa'
            ? `${campoParaPessoa(final.input)}\n${String(avisoDaEquipe ?? '')}`
            : ''
    if (sintoma && orientouConduta(vaiSair)) {
      return await travarConduta(s, ferramentas, bruto, usos, String(pedidoAEquipe?.resumo_para_equipe ?? ''), emEtapa)
    }
    if (usos.length === 0) {
      if (!texto) {
        // Resposta vazia: mais uma tentativa, igual, antes de desistir.
        if (++vazias < 2) continue
        throw new Error('resposta vazia')
      }
      // O que a IA prometeu ("a equipe confirma"), o sistema faz.
      if (prometeuAEquipe(texto)) {
        const continuar = emEtapa && !adiou(s) && !/continu|pergunta acima|👆|\?\s*$/i.test(texto)
          ? '\n\nPara continuar de onde paramos, é só responder a pergunta acima 👆'
          : ''
        const recado = /\bequipe\b/i.test(texto) ? texto : `${texto}\n\nPassei sua pergunta para a nossa equipe, que responde por aqui.`
        const daEquipe = await ferramentas.equipe('atendente', `${recado}${continuar}`.slice(0, 900), { manterEtapa: emEtapa })
        return {
          resultado: daEquipe ?? { resposta: recado, atencao: 'atendente' },
          acao: 'equipe:prometida no texto',
          nota: `🤖 A IA disse que a equipe confirma, sem chamar a equipe. Mensagem da pessoa: «${String(s.texto).slice(0, 400)}»`.slice(0, 1500),
        }
      }
      // So uma interjeicao, ou nada, depois dos cortes: a equipe e chamada de
      // verdade, e a pessoa sabe disso.
      const semCorte = semPromessa(texto)
      const soInterjeicao = /^\s*(?:combinado|fechado|perfeito|certo|certinho|[oó]timo|beleza|pode deixar|entendi|claro)\s*[!.]*\s*$/i
      if ((!semCorte || soInterjeicao.test(semCorte)) && (soInterjeicao.test(texto) || PROMESSA.test(texto))) {
        const recado = 'Passei para a nossa equipe, que confirma isso e responde por aqui.'
        const daEquipe = await ferramentas.equipe('atendente', recado, { manterEtapa: emEtapa })
        return {
          resultado: daEquipe ?? { resposta: recado, atencao: 'atendente' },
          acao: 'equipe:promessa cortada',
          nota: `🤖 A IA prometeu algo que só a equipe faz («${texto.slice(0, 300)}»). Mensagem da pessoa: «${String(s.texto).slice(0, 400)}»`.slice(0, 1500),
        }
      }
      let respostaFinal = semCorte || texto
      // Risco de vida na conversa: o pronto-socorro agora vai na frente, e sem
      // oferta de consulta.
      if (riscoDeVida(s) && !jaNoProntoSocorro(s)) {
        return { resultado: { resposta: comProntoSocorroAgora(semOfertaDeMarcar(respostaFinal), s) }, acao: 'conversou (risco de vida)' }
      }
      // A duvida no meio de um passo: o passo continua la, e a pessoa sabe.
      if (emEtapa && !adiou(s) && !/continu|pergunta acima|👆|\?\s*$/i.test(respostaFinal)) {
        respostaFinal = `${respostaFinal}\n\n${passoDoValor(s) ? 'Para seguir com o pedido, é só tocar em *Entendi, seguir* na mensagem acima 👆' : 'Para continuar de onde paramos, é só responder a pergunta acima 👆'}`
      }
      return { resultado: { resposta: respostaFinal }, acao: 'conversou' }
    }

    // Periodos pedidos junto com a equipe: com tempo sobrando, a agenda volta
    // para a IA e a chamada da equipe fica para a volta seguinte.
    if (final?.name === 'chamar_equipe' && usos.some((u) => u.name === 'ver_horarios') && fim - Date.now() > 7000 && volta < ATE - 1) {
      const resultados = []
      for (const uso of usos) {
        resultados.push(
          uso.name === 'ver_horarios'
            ? { type: 'tool_result', tool_use_id: uso.id, content: await ferramentas.horarios(String(uso.input?.local ?? uso.input?.unidade ?? '')).catch((erro) => `Falhou: ${erro}`) }
            : { type: 'tool_result', tool_use_id: uso.id, is_error: true, content: 'Ainda não feito: com os períodos acima, chame chamar_equipe de novo.' },
        )
      }
      mensagens.push({ role: 'assistant', content: blocos }, { role: 'user', content: resultados })
      continue
    }
    if (final) {
      const juntar = (r: Resultado | null, antes = texto): NonNullable<Resultado> => {
        if (!r) return { resposta: antes || 'Certo!' }
        return { ...r, resposta: antes ? `${antes}\n\n${r.resposta}` : r.resposta }
      }
      if (final.name === 'abrir_fluxo') {
        // "acao" no lugar de "fluxo" vale; fluxo desconhecido volta para a IA.
        const nomeDoFluxo = String(final.input?.fluxo ?? final.input?.acao ?? '')
        const fluxo = FLUXOS[nomeDoFluxo]
        if (!fluxo) {
          if (volta < ATE - 1 && fim - Date.now() > 5000) {
            const resultados = usos.map((u) => ({
              type: 'tool_result',
              tool_use_id: u.id,
              is_error: u.id === final.id,
              content: u.id === final.id ? `Fluxo desconhecido. Use o campo fluxo com um destes: ${Object.keys(FLUXOS).join(', ')}.` : 'Não feito.',
            }))
            mensagens.push({ role: 'assistant', content: blocos }, { role: 'user', content: resultados })
            continue
          }
          throw new Error(`fluxo desconhecido: ${nomeDoFluxo}`)
        }
        final.input.fluxo = nomeDoFluxo
        // Menu sem resposta para a pergunta da pessoa: volta para a IA responder.
        if (nomeDoFluxo === 'menu' && !campoParaPessoa(final.input).trim() && perguntaLateral(s.texto) && volta < ATE - 1 && fim - Date.now() > 5000) {
          const resultados = []
          for (const u of usos) {
            resultados.push(
              u.name === 'ver_horarios'
                ? { type: 'tool_result', tool_use_id: u.id, content: await ferramentas.horarios(String(u.input?.local ?? u.input?.unidade ?? '')).catch((erro) => `Falhou: ${erro}`) }
                : {
                    type: 'tool_result',
                    tool_use_id: u.id,
                    is_error: u.id === final.id,
                    content: u.id === final.id
                      ? 'Menu não aberto: a pessoa fez uma pergunta. Responda a pergunta em texto, sem ferramenta, ou abra o fluxo certo com a resposta em para_pessoa.'
                      : 'Não feito.',
                  },
            )
          }
          mensagens.push({ role: 'assistant', content: blocos }, { role: 'user', content: resultados })
          continue
        }
        // Para a pessoa vai so o para_pessoa: o texto solto junto da ferramenta
        // e o rascunho da IA, filtrado ou nao.
        let paraPessoa = paraSair(campoParaPessoa(final.input), s, urgente)
        // Risco de vida e a pessoa ainda em casa: o pedido de consulta nao abre,
        // porque vira motivo para esperar. Indo ou de volta do pronto-socorro, abre.
        if (nomeDoFluxo === 'agendar' && riscoDeVida(s) && !jaNoProntoSocorro(s)) {
          const resposta =
            comProntoSocorroAgora(semOfertaDeMarcar(paraPessoa), s) +
            '\n\nA consulta não substitui essa avaliação. Depois do pronto-socorro, é só voltar aqui que a gente faz o pedido.'
          return { resultado: { resposta, atencao: 'urgencia' }, acao: 'agendar recusado (risco de vida)' }
        }
        // Quem vai ser atendido nao esta cadastrado neste telefone (a filha
        // pedindo para a mae, com so o pai cadastrado). O robo daqui so oferece
        // os cadastrados e anotaria o pedido no nome de outro: o pedido segue, e
        // a equipe fica sabendo antes de confirmar.
        const pedida = semAcento(String(final.input?.paciente ?? '')).trim().split(/\s+/)[0] ?? ''
        const pessoaNova =
          nomeDoFluxo === 'agendar' && s.pacientes.length > 0 && pedida.length >= 2 &&
          !s.pacientes.some((p) => semAcento(p).trim().split(/\s+/)[0] === pedida)
        let doRobo = await ferramentas.robo(fluxo.texto, fluxo.etapa)
        if (final.input.fluxo === 'agendar') {
          const maisUma = /\b(tamb[eé]m|mais uma|outra consulta|al[eé]m d)|\btbm?\b/i.test(s.texto)
          doRobo = await seguirComOPedido(ferramentas, doRobo, { ...final.input, paciente: pessoaNova ? '' : final.input?.paciente, maisUma })
        }
        // Remarcar ou cancelar a que ja existe: o pedido vai junto, e a pessoa so
        // confirma. Com mais de uma consulta, a lista fica para ela escolher - a
        // nao ser que o paciente tenha sido dito e so uma consulta seja dele.
        let umaSo = s.consultas.length === 1
        const escrito = s.pacientes.filter((p) => p.trim() && new RegExp(String.raw`\b${paraRegex(semAcento(p).trim().split(/\s+/)[0])}\b`).test(semAcento(s.texto)))
        const pacienteDoFluxo = semAcento(String(final.input?.paciente ?? '') || (escrito.length === 1 ? escrito[0] : '')).trim().split(/\s+/)[0]
        const doPaciente = pacienteDoFluxo.length >= 2 ? s.consultas.map((c, i) => ({ c, i })).filter(({ c }) => semAcento(c).endsWith(` · ${pacienteDoFluxo}`)) : []
        if (fluxo.depois && !umaSo && doPaciente.length === 1 && ferramentas.etapa && (await ferramentas.etapa()) === 'minha_consulta') {
          const escolhida = await ferramentas.robo(String(doPaciente[0].i + 1), 'atual')
          if (escolhida && !roboNaoEntendeu(escolhida)) {
            doRobo = escolhida
            umaSo = true
          }
        }
        if (fluxo.depois && umaSo && ferramentas.etapa && (await ferramentas.etapa()) === 'minha_consulta') {
          const r = await ferramentas.robo(fluxo.depois, 'atual')
          if (r && !roboNaoEntendeu(r)) doRobo = r
          // Remarcar nao cancela nada antes de a nova ser confirmada, entao o SIM
          // e so um passo a mais: o pedido segue ate a primeira pergunta dele.
          // Cancelar continua esperando o SIM da pessoa.
          if (final.input.fluxo === 'remarcar' && (await ferramentas.etapa()) === 'confirmar_cancelamento') {
            const novo = await ferramentas.robo('sim', 'atual')
            if (novo && !roboNaoEntendeu(novo)) doRobo = await seguirComOPedido(ferramentas, novo, { ...final.input })
          }
        }
        // A pergunta que veio junto e ficou sem resposta: com tempo, a resposta vai na frente.
        let equipeDoFluxo: { motivo: string; resumo: string } | undefined
        if (!paraPessoa && doRobo && perguntaLateral(s.texto) && fim - Date.now() > 3000) {
          const lateral = await responderPerguntaLateral(s, doRobo.resposta, chamar, modelo, Math.min(fim - Date.now(), 8000)).catch((erro) => {
            console.warn('Atendente com IA falhou na pergunta junto do pedido', erro)
            return null
          })
          if (lateral?.texto) {
            paraPessoa = lateral.texto
            equipeDoFluxo = lateral.equipe
          }
        }
        if (riscoDeVida(s) && !jaNoProntoSocorro(s)) paraPessoa = comProntoSocorroAgora(semOfertaDeMarcar(paraPessoa), s)
        paraPessoa = semPromessa(paraPessoa)
        // O preco perguntado vai junto do pedido: quem ja e paciente nao passa
        // pelo passo do valor.
        if (final.input.fluxo === 'agendar' && valorPedidoENaoDito(s) && !/R\$/.test(paraPessoa) && s.valor) {
          paraPessoa = [paraPessoa, s.valor].filter(Boolean).join('\n\n')
        }
        // O menu ja cumprimenta: so a resposta a uma pergunta vai na frente dele.
        if (final.input.fluxo === 'menu') {
          const informa = /R\$\s*\d/.test(paraPessoa)
          const semOla = paraPessoa.replace(/^\s*(?:ol[aá]|oi|bom dia|boa tarde|boa noite)(?![a-zà-ú])[^.!?\n]*[.!?]+\s*(?=\S)/i, '')
          return { resultado: doRobo ? juntar(doRobo, perguntaLateral(s.texto) || informa ? semOla : '') : { resposta: texto || 'Certo!' }, acao: 'fluxo:menu' }
        }
        // chamar_equipe na mesma resposta vira a duvida do fluxo.
        const equipeJunto = usos.find((u) => u.name === 'chamar_equipe')?.input
        if (equipeJunto) {
          const daEquipe = paraSair(campoParaPessoa(equipeJunto), s, urgente)
          if (!paraPessoa) paraPessoa = daEquipe
          else if (daEquipe && !quaseIgual(paraPessoa, daEquipe)) paraPessoa = `${paraPessoa} ${daEquipe}`
        }
        const duvidas = [
          String(final.input?.duvida_para_equipe ?? '').trim() ||
            equipeDoFluxo?.resumo ||
            String(equipeJunto?.resumo_para_equipe ?? '').trim() ||
            (equipeJunto ? `(sem resumo) ${String(s.texto).slice(0, 300)}` : ''),
          pessoaNova
            ? `O pedido é para «${String(final.input?.paciente ?? '').trim()}», que não tem cadastro neste telefone (${s.pacientes.join(', ')}): confira o nome do paciente antes de confirmar.`
            : '',
        ].filter(Boolean)
        const resultado = juntar(doRobo, paraPessoa)
        if (duvidas.length) {
          return {
            resultado: { ...resultado, atencao: resultado?.atencao ?? 'atendente' },
            acao: `fluxo:${final.input.fluxo} + equipe`,
            nota: `🤖 Para a equipe (a pessoa seguiu no pedido): ${duvidas.join(' ')}`.slice(0, 1500),
          }
        }
        return { resultado, acao: `fluxo:${final.input.fluxo}` }
      }
      if (final.name === 'responder_etapa') {
        // O "[cpf]" e o "[e-mail]" que a IA ve no lugar dos dados voltam ao que a
        // pessoa escreveu (no sistema do Dr. Marcello, rodada 14: o robo leu
        // "[cpf]" e respondeu "Esse CPF nao confere").
        const traduzido = String(final.input?.texto ?? '')
          .replace(/\[cpf\]/gi, () => s.texto.match(/\d{3}[.\s]?\d{3}[.\s]?\d{3}\s?[-.\s]?\s?\d{2}/)?.[0] ?? '[cpf]')
          .replace(/\[e-?mail\]/gi, () => s.texto.match(/[^\s@,;:<>()]+@[^\s@,;:<>()]+\.[a-z]{2,}/i)?.[0] ?? '[e-mail]')
          .slice(0, 300)
        const respostaDaIA = semPromessa(paraSair(campoParaPessoa(final.input), s, urgente))
        // O passo do valor e da pessoa (27/10/2026, o caso do paciente que achou
        // que era pelo plano): "seguir" so com o aceite dela, com as palavras dela.
        if (passoDoValor(s) && /^\s*(1|entendi|seguir|entendi,? seguir|ok|sim|pode seguir)\s*[.!]*\s*$/i.test(traduzido) && !aceitouOValor(s.texto)) {
          console.warn('Atendente com IA tentou seguir o passo do valor sem o aceite da pessoa; recusado', s.texto.slice(0, 120))
          return {
            resultado: {
              resposta: [respostaDaIA, 'Para seguir com o pedido, é só tocar em *Entendi, seguir* na mensagem acima 👆'].filter(Boolean).join('\n\n'),
              botoes: [
                { id: '1', titulo: 'Entendi, seguir' },
                { id: '2', titulo: 'Tenho dúvida' },
              ],
            },
            acao: 'valor_sem_aceite',
          }
        }
        // PULAR so quando a pessoa disse que nao tem ou nao sabe.
        const pulouSemDizer = /^dados_/.test(s.etapa ?? '') && /^\s*pular\s*$/i.test(traduzido) && !PESSOA_PULOU.test(semAcento(s.texto))
        const respostaDoPulo = pulouSemDizer ? respostaDaIA : ''
        if (respostaDoPulo) {
          return {
            resultado: { resposta: `${respostaDoPulo}\n\nPara continuar, é só responder a pergunta acima 👆` },
            acao: 'etapa_sem_pular',
          }
        }
        // Texto vazio no passo de dado nao vai ao robo: vai a resposta da IA, e o
        // passo continua.
        if (passoDeDado(s) && !traduzido.trim()) {
          return {
            resultado: { resposta: [respostaDaIA, 'Para continuar, é só responder a pergunta acima 👆'].filter(Boolean).join('\n\n') },
            acao: 'etapa_vazia',
          }
        }
        // No passo de dado, so palavras que a pessoa escreveu. "A partir de
        // quando" aceita tambem as tres opcoes do proprio botao.
        const opcaoDoQuando = /_quando$/.test(s.etapa ?? '') && /^\s*(esta semana|proxima semana|próxima semana|tanto faz|1|2|3)\s*$/i.test(traduzido)
        if (pulouSemDizer || (passoDeDado(s) && !opcaoDoQuando && !veioDaPessoa(traduzido, s.texto))) {
          console.warn('Atendente com IA mandou para o passo um texto que a pessoa nao escreveu; recusado', traduzido)
          if (!pulouSemDizer && respostaDaIA && perguntaLateral(s.texto)) {
            return {
              resultado: { resposta: `${respostaDaIA}\n\nPara continuar, é só responder a pergunta acima 👆` },
              acao: 'etapa_recusada_com_resposta',
            }
          }
          const repetida = /Passei o seu pedido para a nossa equipe/.test(s.ultimaDoConsultorio ?? '')
          const recado = repetida
            ? 'A equipe já está com o seu pedido e confirma por aqui.\n\nPara continuar, é só responder a pergunta acima 👆'
            : 'Passei o seu pedido para a nossa equipe, que confirma por aqui.\n\nPara continuar, é só responder a pergunta acima 👆'
          const daEquipe = await ferramentas.equipe('atendente', recado, { manterEtapa: true })
          return {
            resultado: daEquipe ?? { resposta: recado, atencao: 'atendente' },
            acao: 'etapa_recusada',
            nota: `🤖 No meio do pedido a pessoa escreveu algo que não é resposta do passo: «${String(s.texto).slice(0, 400)}». A IA tentou preencher com «${traduzido}»; foi recusado. Confira o que ela pediu.`.slice(0, 1500),
          }
        }
        const r = await ferramentas.robo(traduzido, 'mesma')
        // Traduziu e o robo ainda nao entendeu: o Claude nao insiste, explica.
        if (roboNaoEntendeu(r)) {
          return { resultado: juntar(r, respostaDaIA), acao: 'etapa_sem_sucesso' }
        }
        // O passo e a equipe na mesma vez (no sistema do Dr. Marcello, rodada 5:
        // a chamada era jogada fora sem aviso). O passo segue, e a duvida vai
        // para a equipe com o passo mantido.
        const junto = usos.find((u) => u.name === 'chamar_equipe' && u.input?.motivo !== 'urgencia')
        if (junto && r) {
          const recado = paraSair(campoParaPessoa(junto.input) || String(junto.input?.texto ?? ''), s, urgente)
          const motivoJunto = String(junto.input?.motivo ?? 'pessoa')
          const aviso = recado && !falaComAEquipe(recado) ? recado : AVISO_PADRAO
          const daEquipe = await ferramentas.equipe(MOTIVOS[motivoJunto] ?? 'atendente', aviso, { manterEtapa: true })
          const resumo = String(junto.input?.resumo_para_equipe ?? '').trim() || `(sem resumo) ${String(s.texto).slice(0, 300)}`
          // O pedido que acabou de ser anotado vence a etiqueta da duvida: e ele
          // que manda o aviso ao WhatsApp da Dra.
          const atencao = r.pedido ? r.atencao : daEquipe?.atencao ?? 'atendente'
          return {
            resultado: { ...juntar(r, [respostaDaIA, respostaDaIA && quaseIgual(aviso, respostaDaIA) ? '' : aviso].filter(Boolean).join('\n\n')), atencao },
            acao: `etapa + equipe:${motivoJunto}`,
            nota: `🤖 Resumo da IA para a equipe: ${resumo}`.slice(0, 1500),
          }
        }
        return { resultado: r ? juntar(r, respostaDaIA) : { resposta: respostaDaIA || texto || 'Certo!' }, acao: 'etapa' }
      }
      if (final.name === 'chamar_equipe') {
        // Pergunta hipotetica, sem sinal de alarme e sem urgencia aberta, nao e
        // urgencia: a equipe fica sabendo como pergunta medica.
        const hipotetica =
          /\b(?:e\s+)?se\s+(?:\S+\s+){0,4}?(?:acontecer|tiver|vier|ficar|piorar|aparecer|subir|voltar|der|quiser|cair)\b/i.test(semAcento(s.texto)) &&
          !sinalDeAlarme(s.texto.replace(/\b(?:e\s+)?se\s+[^.!?]*[.!?]?/gi, ' ')) &&
          !conversaDeUrgencia(s)
        const motivo = String(final.input?.motivo ?? 'pessoa') === 'urgencia' && hipotetica ? 'medico' : String(final.input?.motivo ?? 'pessoa')
        const escrito = campoParaPessoa(final.input) || String(final.input?.texto ?? '')
        let resumo = String(final.input?.resumo_para_equipe ?? '').trim()
        let aviso = paraSair(semRepetir(limparTexto(escrito, urgente), ultimaNossa), s, urgente) || texto || AVISO_PADRAO
        if (falaComAEquipe(aviso)) {
          console.warn('Atendente com IA escreveu para a equipe no texto da pessoa; vai como nota interna', aviso.slice(0, 200))
          resumo = [resumo, aviso].filter(Boolean).join('\n\n')
          // Na urgencia, a troca nunca pode enfraquecer o recado.
          aviso =
            motivo !== 'urgencia'
              ? AVISO_PADRAO
              : PRONTO_SOCORRO.test(aviso)
                ? '🚨 Procure agora o pronto-socorro mais próximo ou ligue 192, sem esperar resposta por aqui. Já avisei a nossa equipe.'
                : '🚨 Entendo a preocupação. Já avisei a nossa equipe, que vai ver a sua mensagem com prioridade e responder por aqui.'
        }
        if (motivo !== 'urgencia' && valorPedidoENaoDito(s) && !/R\$/.test(aviso) && s.valor) {
          aviso = `${s.valor}\n\n${aviso}`
        }
        // Piora numa urgencia que ja estava aberta, ou um sinal que ainda nao
        // tinha aparecido: a pessoa ouve na primeira frase que nao deve esperar.
        const sinalAgora = sinalDeAlarme(s.texto)
        const sinalNovo = Boolean(sinalAgora) && !s.historico.some((m) => m.de === 'pessoa' && sinalDeAlarme(m.texto)?.nome === sinalAgora?.nome)
        const piora = motivo === 'urgencia' && conversaDeUrgencia(s) && (contaPiora(s.texto) || sinalNovo)
        if (piora) {
          aviso = aviso
            .split('\n')
            .map((linha) => linha.split(FIM_DE_FRASE).filter((f) => !/^\s*se\b|\bse\s+(?:\S+\s+)?piorar\b|\bse for uma emerg[eê]ncia\b|continua marcada|est[aá] confirmada|est[aá] marcada|consulta d[aeo]\b[^.!?\n]{0,40}\b(?:confirmad|marcad|mantid)/i.test(f)).join(' '))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
          const firme = aviso
            .split(/\n|(?<=[.!?])\s+/)
            .some((f) => PRONTO_SOCORRO.test(f) && /\bagora\b/i.test(f) && !/^\s*se\b|\bse\s+(?:ele|ela|o paciente|a paciente|piorar|ficar)\b/i.test(f))
          if (!firme) {
            aviso = ['🚨 Se piorou, não espere a nossa resposta nem a consulta: procure agora o pronto-socorro mais próximo ou ligue 192. Já avisei a nossa equipe de novo.', aviso].filter(Boolean).join('\n\n')
          }
        }
        const vida = motivo === 'urgencia' && riscoDeVida(s) && !jaNoProntoSocorro(s)
        const firmeAgora = aviso.split(FIM_DE_FRASE).some((f) => !/^\s*(?:🚨\s*)?\*?se\b/i.test(f) && PRONTO_SOCORRO.test(f) && /\bagora\b/i.test(f))
        if (vida) {
          aviso = comProntoSocorroAgora(semOfertaDeMarcar(aviso), s)
        } else if (motivo === 'urgencia' && firmeAgora && !jaNoProntoSocorro(s)) {
          aviso = semOfertaDeMarcar(aviso)
        } else if (!piora && motivo === 'urgencia' && !PRONTO_SOCORRO.test(aviso) && !PRONTO_SOCORRO.test(s.ultimaDoConsultorio ?? '')) {
          aviso = `${aviso}\n\n${AVISO_DE_URGENCIA}`
        }
        // Duvida no meio do pedido: a equipe fica sabendo e o passo continua
        // aberto. Urgencia sai do fluxo, a nao ser num passo de dado (o pedido
        // pela metade nao se perde por uma pergunta).
        const manterEtapa = emEtapa && (motivo !== 'urgencia' || passoDeDado(s))
        if (manterEtapa && !adiou(s) && !/continu|pergunta acima|👆|\?\s*$/i.test(aviso)) {
          aviso = `${aviso}\n\nPara continuar de onde paramos, é só responder a pergunta acima 👆`
        }
        if (!resumo) resumo = `(sem resumo) ${String(s.texto).slice(0, 300)}`
        // "Avisei de novo" sem piora sai: so a piora avisa de novo.
        if (!piora) {
          aviso = aviso
            .split('\n')
            .map((linha) => linha.split(FIM_DE_FRASE).filter((f) => !/\bavis\w*\b(?:[^.!?\n]|\bDra?\.){0,50}\b(?:de novo|novamente|outra vez)\b/i.test(f)).join(' '))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim() || AVISO_PADRAO
        }
        const daEquipe = await ferramentas.equipe(MOTIVOS[motivo] ?? 'atendente', aviso.slice(0, 900), { manterEtapa })
        return {
          resultado: daEquipe,
          acao: `equipe:${motivo}${manterEtapa ? ' (passo mantido)' : ''}${piora ? ' (piora)' : ''}`,
          nota: `🤖 Resumo da IA para a equipe: ${resumo}`.slice(0, 1500),
        }
      }
      throw new Error(`ferramenta desconhecida: ${final.name}`)
    }

    // So consultas de periodos: responde e da outra volta.
    const resultados = []
    for (const uso of usos) {
      const conteudo = await ferramentas.horarios(String(uso.input?.local ?? uso.input?.unidade ?? '')).catch((erro) => `Falhou: ${erro}`)
      resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: conteudo })
    }
    mensagens.push({ role: 'assistant', content: blocos }, { role: 'user', content: resultados })
  }
  throw new Error('voltas demais')
}

/**
 * O numero de uma linha da lista que o robo acabou de mandar ("*1* 🏥
 * Consultório (Gonzaga)", "*2* Maria Teste"), pelo nome ou pelo jeito de
 * dizer. O robo daqui so le o numero nesses passos, entao quem traduz e aqui.
 * Vazio quando nao da para ter certeza: o robo pergunta, como sempre.
 */
function numeroNaLista(resposta: string | undefined, pedido: string, tipo: 'paciente' | 'local'): string {
  const alvo = semAcento(pedido).trim()
  if (!resposta || alvo.length < 2) return ''
  const linhas = [...resposta.matchAll(/^\*(\d{1,2})\*\s+(.+)$/gm)].map((m) => ({ n: m[1], nome: semAcento(m[2]) }))
  const casa = /\b(casa|domicil\w*|visita|residencia)\b/.test(alvo)
  const consultorio = /\b(consultorio|gonzaga|clinica|presencial)\b/.test(alvo)
  const achados = linhas.filter(({ nome }) => {
    if (tipo === 'local') {
      if (casa) return /\b(visita|domicil\w*|casa)\b/.test(nome) || nome.includes('🏠')
      if (consultorio) return /\b(consultorio|gonzaga)\b/.test(nome) || nome.includes('🏥')
      return nome.includes(alvo)
    }
    const primeiro = alvo.split(/\s+/)[0]
    return nome.split(/\s+/)[0] === primeiro
  })
  return achados.length === 1 ? achados[0].n : ''
}

/**
 * O pedido ja no local e no tipo combinados (no sistema do Dr. Marcello,
 * 17/10/2026: o "sim" a "quer que eu siga?" abria "Em qual unidade?", e a
 * pessoa escolhia de novo o que acabara de combinar). O fluxo e aberto como
 * sempre e, a cada passo, o robo recebe a resposta como se a pessoa a tivesse
 * digitado - com as regras dele. So avanca enquanto o robo estiver num passo
 * que o pedido responde.
 *
 * Nunca passa do valor: o passo pedido_valor ou visita_valor e da pessoa, que
 * le o preco e toca em "Entendi, seguir" (27/10/2026).
 */
async function seguirComOPedido(
  ferramentas: Ferramentas,
  aberto: Resultado | null,
  pedido: { paciente?: unknown; local?: unknown; tipo?: unknown; maisUma?: boolean },
): Promise<Resultado | null> {
  if (!ferramentas.etapa) return aberto
  let atual = aberto
  const feito = new Set<string>()
  for (let passo = 0; passo < 5; passo++) {
    const etapa = await ferramentas.etapa()
    // Cada passo vale uma vez: o robo que voltou ao mesmo passo nao entendeu.
    if (!etapa || feito.has(etapa) || /_valor$/.test(etapa)) break
    const tipo = semAcento(String(pedido.tipo ?? ''))
    const texto =
      etapa === 'ja_tem_consulta'
        ? (pedido.maisUma ? '2' : '')
        : etapa === 'aguardando_paciente'
          ? numeroNaLista(atual?.resposta, String(pedido.paciente ?? ''), 'paciente')
          : etapa === 'aguardando_unidade'
            ? numeroNaLista(atual?.resposta, String(pedido.local ?? ''), 'local')
            : etapa === 'pedido_tipo'
              ? (/retorno/.test(tipo) ? 'retorno' : /primeira/.test(tipo) ? 'primeira consulta' : '')
              : ''
    if (!texto) break
    feito.add(etapa)
    const r = await ferramentas.robo(texto.slice(0, 60), 'atual')
    if (!r || roboNaoEntendeu(r)) break
    atual = r
  }
  return atual
}

/**
 * A trava de conduta, sem apagar a urgencia (no sistema do Dr. Marcello,
 * 16/10 e 17/10/2026: a trava trocou o texto pela frase padrao e mandou a
 * conversa como "atendente", e o aviso da urgencia so saiu na mensagem
 * seguinte). A urgencia continua urgencia; a nota conta o que a IA escreveu.
 */
async function travarConduta(
  s: Situacao,
  ferramentas: Ferramentas,
  bruto: string,
  usos: Extract<Bloco, { type: 'tool_use' }>[],
  resumo: string,
  emEtapa: boolean,
): Promise<{ resultado: Resultado; acao: string; nota: string }> {
  const urgencia =
    usos.some((u) => u.name === 'chamar_equipe' && u.input?.motivo === 'urgencia') ||
    pessoaFalouDeUrgencia(s.texto) ||
    Boolean(sinalDeAlarme(s.texto)) ||
    conversaDeUrgencia(s)
  const jaDisse = /quem orienta [eé]/i.test(s.ultimaDoConsultorio ?? '')
  const fechado = !dentroDoExpediente(s.agora)
  const nota =
    '🤖 A resposta da IA citava remédio ou dose numa mensagem com sintoma; por segurança saiu a frase padrão.' +
    (resumo.trim() ? `\nResumo da IA: ${resumo.trim()}` : '') +
    `\nO que a IA tinha escrito: «${bruto.slice(0, 600)}»`
  if (urgencia) {
    const vida = riscoDeVida(s) || bruto.split(FIM_DE_FRASE).some((f) => !/^\s*(?:🚨\s*)?\*?se\b/i.test(f) && /\bagora\b[^.!?\n]{0,60}pronto[\s-]?socorro|pronto[\s-]?socorro[^.!?\n]{0,30}\bagora\b/i.test(f))
    const aviso = vida
      ? '🚨 Procure agora o pronto-socorro mais próximo ou ligue 192, sem esperar resposta por aqui. Já avisei a nossa equipe. Remédio e dose, só com a orientação médica.'
      : '🚨 Entendo a preocupação. Já avisei a nossa equipe, que vai ver a sua mensagem com prioridade e responder por aqui. ' +
        'Remédio e dose, só com a orientação médica.\n\n' +
        AVISO_DE_URGENCIA
    const r = await ferramentas.equipe('urgencia', aviso, { manterEtapa: emEtapa && passoDeDado(s) })
    return { resultado: r ?? { resposta: aviso, atencao: 'urgencia' }, acao: 'equipe:urgencia (trava de conduta)', nota }
  }
  const aviso = jaDisse
    ? `Como falei, remédio e dose quem orienta é ${s.quemAtende}, e a equipe já está com a sua mensagem.`
    : `Sobre o que fazer agora, quem orienta é ${s.quemAtende}: já passei para a equipe, que responde por aqui.`
  const continuar = emEtapa ? '\n\nPara continuar de onde paramos, é só responder a pergunta acima 👆' : ''
  return {
    resultado: await ferramentas.equipe(
      'atendente',
      aviso + (fechado ? ' Se a pessoa estiver mal, procure o pronto-socorro mais próximo ou ligue 192.' : '') + continuar,
      { manterEtapa: emEtapa },
    ),
    acao: 'equipe:medico (trava de conduta)',
    nota,
  }
}

/**
 * Pergunta de verdade junto da resposta de um passo (no sistema do Dr.
 * Marcello, rodada 5 do painel): "?" ou palavra de pergunta, e uma palavra que
 * nao e enchimento, nome de local, periodo ou tipo de consulta.
 */
const ENCHIMENTO_DO_PASSO = new Set([
  'pode', 'ser', 'as', 'sim', 'ok', 'quero', 'esse', 'essa', 'este', 'esta', 'de', 'da', 'do', 'em', 'na', 'no', 'para', 'pra',
  'mesmo', 'msm', 'entao', 'horario', 'dia', 'hoje', 'amanha', 'tem', 'isso', 'por', 'favor', 'obrigado', 'obrigada', 'ne', 'ta',
  'certo', 'santos', 'gonzaga', 'consultorio', 'casa', 'visita', 'domiciliar', 'domicilio', 'vicente', 'sao', 'primeira', 'retorno',
  'consulta', 'vez', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'pensando', 'bem', 'melhor', 'prefiro',
  'vdd', 'verdade', 'ah', 'oi', 'um', 'uma', 'ou', 'tudo', 'pronto', 'tarde', 'manha', 'noite', 'otimo', 'otima', 'seria', 'bom',
  'boa', 'perfeito', 'ai', 'la', 'aqui', 'hora', 'horas', 'cedo', 'mais', 'semana', 'proxima', 'tanto', 'faz', 'entendi', 'seguir',
])
// Recado para a Dra. tambem e pergunta ("avisa a dra que ela parou o remedio"):
// no sistema do Dr. Marcello o recado so chegou quando a mae escreveu de novo.
const PALAVRA_DE_PERGUNTA = /\b(onde|como|quando|quanto|quanta|qnto|qnta|qnt|qnts|qto|qta|vlr|valores|precos|qual|quais|avisa|avise|fala pra|diz pra|conta pra|recado|pede pra|posso|devo|paro|tiro|corto|por que|porque|ou nao|ou n|pode ir|tem q(ue)? ir|ou tem q(ue)?|precisa (ir|levar|trazer)|errad[oa]|errei|trocado|arruma|corrig\w*|assina|sozinh[oa]|faltou|esqueci|se escreve|escreve com)\b/
const ASSUNTO_DE_PERGUNTA =
  /\b(estacionamento|endereco|valor|preco|pix|pagamento|pagar|convenio|plano|reembolso|recibo|atestado|relatorio|laudo|receita|exames?|desconto|parcela|parcelar|cartao|unimed|amil|bradesco|sulamerica|demora|documentos?|acompanhante|cuidador)\b/

/**
 * `amplo`: nos passos de escolha (local, tipo, periodos), a resposta e curta, e
 * tres palavras a mais ja sao outro assunto, mesmo sem "?". Nos passos de dado
 * nao: o nome completo tem tres palavras e nao e pergunta.
 */
export function perguntaLateral(texto: string, amplo = false): boolean {
  const t = semAcento(texto)
  const palavras = t
    .replace(/\S+@\S+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1 && !ENCHIMENTO_DO_PASSO.has(p))
  if (texto.includes('?') || PALAVRA_DE_PERGUNTA.test(t) || ASSUNTO_DE_PERGUNTA.test(t)) return palavras.length >= 1
  return amplo && palavras.length >= 3
}

/** Passos de escolha do agendamento e do pedido: a resposta e um numero ou uma palavra. */
const PASSO_DE_ESCOLHA = /^(aguardando_(paciente|unidade|convenio|dia|horario)|pedido_(tipo|periodos)|visita_periodos|ja_tem_consulta|informacoes_unidade)$/

/**
 * So pergunta, num passo de dado (porte de 28/10/2026). O robo daqui grava o
 * que chegar como nome, endereco ou restricao: "tem estacionamento?" no passo
 * do endereco virava o endereco da visita, e era isso que ia no aviso a Dra.
 * Com a IA ligada, a pergunta e respondida e o passo continua; o que for
 * resposta com pergunta junto ("Maria Teste. Quanto custa?") a IA separa.
 */
function soPerguntaNoPassoDeDado(s: Situacao): boolean {
  if (!passoDeDado(s)) return false
  const t = semAcento(s.texto).trim()
  if (!t) return false
  // A data no passo do nascimento e resposta, com ou sem "?".
  if (/nascimento$/.test(s.etapa ?? '') && /\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b/.test(t)) return false
  return /\?/.test(t) || /^(qual|quais|quanto|quanta|qnto|qto|como|onde|aceita|aceitam|atende|atendem|voces|vcs|tem como|precisa|posso|pode|a dra|a doutora|e o valor|e quanto)\b/.test(t)
}

/** A pessoa disse que nao tem, nao sabe ou quer pular (para o PULAR da IA). */
const PESSOA_PULOU = /\b(pular|pula|pulo|nao sei|n sei|nao tenho|n tenho|nao tem|n tem|nao lembro|n lembro|sem cpf|sem email|sem e-mail|nao possui|nao uso|depois|mando depois)\b/

/** Toda palavra do texto traduzido aparece no que a pessoa escreveu (ou e PULAR). */
function veioDaPessoa(traduzido: string, daPessoa: string): boolean {
  const escrito = semAcento(daPessoa)
  const palavras = semAcento(traduzido).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((p) => p.length >= 3)
  if (palavras.length === 0) return true
  if (palavras.length === 1 && palavras[0] === 'pular') return true
  return palavras.every((p) => escrito.includes(p))
}

const SO_A_PERGUNTA =
  'A pessoa respondeu o passo do sistema, e o sistema já seguiu: a tela dele vai logo depois do seu texto (ela está no fim destas instruções). ' +
  'A mensagem dela também trazia uma pergunta. Responda só essa pergunta, em uma ou duas frases, falando com ela, com o que está em <clinica> ou na tela do sistema. ' +
  'Se a tela do sistema já responde, diga isso em poucas palavras, sem contradizer a tela; se não houver o que acrescentar, não escreva nada. ' +
  'Não repita o passo, não peça dados, não ofereça marcar. ' +
  'Nunca diga o que fazer com o paciente, a alimentação ou o remédio, nem "não mude nada": isso é da Dra. ' +
  'Pergunta da equipe (conduta, documento, exceção, dinheiro): use chamar_equipe, com a resposta para a pessoa em para_pessoa. ' +
  'Correção de um dado já respondido (o nome escrito errado, outra data): use chamar_equipe com a correção no resumo, e diga que a equipe corrige. ' +
  'Nunca prometa fazer algo depois (avisar, anotar): ou a tela já mostra, ou a equipe resolve.'

// A pergunta solta no meio do passo (no sistema do Dr. Marcello, 18/10/2026:
// "Ele atende convenios?" na escolha da unidade fez a IA reescrever a pergunta
// do passo com os valores). A IA so responde a duvida; a tela e a do robo.
const SO_A_DUVIDA =
  'A pessoa está num passo do pedido e, em vez de responder, fez uma pergunta. O sistema vai mandar a tela do passo de novo logo depois do seu texto (ela está no fim destas instruções). ' +
  'Responda só essa pergunta, em uma ou duas frases, falando com ela, com o que está em <clinica>. ' +
  'Não repita a tela nem a pergunta do passo, não liste os locais, não peça para escolher, não ofereça marcar. ' +
  'Valor da consulta só se ela perguntou de valor ou preço. ' +
  'Nunca diga o que fazer com o paciente, a alimentação ou o remédio: isso é da Dra. ' +
  'Pergunta da equipe (conduta, documento, exceção, dinheiro): use chamar_equipe, com a resposta para a pessoa em para_pessoa. ' +
  'Nunca prometa fazer algo depois (avisar, anotar, reservar): ou a tela já mostra, ou a equipe resolve.'

// Pedido para mudar o rumo do pedido nao e duvida: a IA de conversa resolve com
// as ferramentas (trocar de local, de paciente, voltar).
const PEDIDO_NO_PASSO = /\b(troca\w*|muda\w*|remarca\w*|outr[ao]s?|volta\w*|cancel\w*|desist\w*)\b/

/** A tela do passo que o robo mandaria de novo: a instrucao "Responda..." do fim da resposta dele. */
function telaDoPasso(r: Resultado | null): string | null {
  if (!r) return null
  const achado = /(?:^|\n\n|\.\s)(Responda\b[\s\S]*)$/.exec(r.resposta)
  return achado ? achado[1].trim() : null
}

// Conduta sobre remedio e alimentacao que a trava de remedio (CONDUTA) nao
// pegava (no sistema do Dr. Marcello, rodada 6: "ate la, melhor nao mudar nada").
const CONDUTA_DE_DIETA =
  /\bn[aã]o\s+(d[eê]|ofere[cç]a|fa[cç]a)\s+nada\b|\bn[aã]o\s+mude\b|\bn[aã]o\s+mudar\s+nada\b|\b(mantenha|continue|pare|suspenda|tire|retire|corte|evite|volte)\b[^.!?\n]{0,30}\b(rem[eé]dios?|medica[cç][aã]o|medicamentos?|dieta|alimenta[cç][aã]o|sal|a[cç][uú]car|leite|insulina)\b/i

type Lateral = { texto: string; equipe?: { motivo: string; resumo: string } }

async function responderPerguntaLateral(s: Situacao, tela: string, chamar: ChamarClaude, modelo: string, prazoMs: number, instrucao = SO_A_PERGUNTA): Promise<Lateral> {
  const resposta = await chamar(
    {
      model: modelo,
      max_tokens: 600,
      thinking: { type: 'between_tools' },
      system: [
        ...sistemaDoClaude(s, false),
        { type: 'text', text: `${instrucao}\n\nA tela do sistema, que vai logo depois do seu texto:\n«${semDadosPessoais(tela).slice(0, 900)}»` },
      ],
      // So a ferramenta da equipe: sem nenhuma, a IA escreveu a chamada como
      // texto e o JSON cru chegou a pessoa (no sistema do Dr. Marcello, rodada 6).
      tools: ferramentasDoClaude(false).filter((f) => f.name === 'chamar_equipe'),
      messages: [{ role: 'user', content: contexto(s) }],
    },
    prazoMs,
  )
  const blocos = Array.isArray(resposta?.content) ? resposta.content : []
  const uso = blocos.find((b): b is Extract<Bloco, { type: 'tool_use' }> => b.type === 'tool_use' && b.name === 'chamar_equipe')
  const solto = blocos
    .filter((b): b is Extract<Bloco, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  // Texto solto junto de uma ferramenta que nao foi oferecida e rascunho.
  const outraFerramenta = blocos.some((b) => b.type === 'tool_use' && b.name !== 'chamar_equipe')
  const bruto = uso ? campoParaPessoa(uso.input) : outraFerramenta ? '' : solto
  const urgente = pessoaFalouDeUrgencia(s.texto) || conversaDeUrgencia(s) || Boolean(sinalDeAlarme(s.texto))
  let texto = semPromessa(paraSair(bruto, s, urgente)).slice(0, 700)
  let equipe = uso
    ? { motivo: String(uso.input?.motivo ?? 'medico'), resumo: String(uso.input?.resumo_para_equipe ?? '').trim() || s.texto.slice(0, 300) }
    : undefined
  // Conduta nao sai nem aqui: vai a frase de quem orienta, e a equipe fica sabendo.
  if (orientouConduta(texto) || CONDUTA_DE_DIETA.test(texto)) {
    texto = `Sobre isso, quem orienta é ${s.quemAtende}: já passei para a equipe, que responde por aqui.`
    equipe = { motivo: 'medico', resumo: equipe?.resumo || s.texto.slice(0, 300) }
  }
  return { texto, equipe }
}

/** No modo sombra nada acontece de verdade: o robo e a equipe sao de mentira. */
function ferramentasDeMentira(reais: Ferramentas): Ferramentas & { feito: string[] } {
  const feito: string[] = []
  return {
    feito,
    robo: async (texto, etapa) => {
      feito.push(`o sistema seguiria com "${texto}" (${etapa})`)
      return { resposta: `[o sistema seguiria com: ${texto}]` }
    },
    horarios: reais.horarios,
    equipe: async (motivo, texto) => {
      feito.push(`passaria para a equipe (${motivo})`)
      return { resposta: texto, atencao: motivo }
    },
  }
}

/**
 * Sinal de alarme e a IA nao marcou urgencia (porte de 28/10/2026): a conversa
 * fica marcada assim mesmo, e o rodape do pronto-socorro vai se faltar. O robo
 * daqui nao reconhece esses sinais, entao, se a IA escorregar, ninguem mais
 * acende a conversa - e falha calada e o pior que existe.
 */
function comUrgenciaGarantida(s: Situacao, r: Resultado | null): Resultado | null {
  const sinal = sinalDeAlarme(s.texto)
  if (!r || !sinal || r.atencao === 'urgencia') return r
  console.warn('Atendente com IA: sinal de alarme sem chamar a equipe com urgencia; marcado assim mesmo', sinal.nome)
  const resposta = PRONTO_SOCORRO.test(r.resposta) ? r.resposta : `${r.resposta}\n\n${AVISO_DE_URGENCIA}`
  return { ...r, resposta, atencao: 'urgencia' }
}

const URGENTE_SEM_IA =
  '🚨 Entendo a preocupação. Já avisei a nossa equipe, que vai ver a sua mensagem com prioridade e responder por aqui.\n\n' +
  AVISO_DE_URGENCIA

export async function atenderComAssistente(opcoes: {
  modo: ModoDoAssistente
  situacao: Situacao
  ferramentas: Ferramentas
  /** Nulo sem chave da API. */
  chamar: ChamarClaude | null
  modelo?: string
  /** O robo como hoje, com a mensagem real. */
  roboDireto: () => Promise<Resultado | null>
  /** Texto do item tocado, quando a mensagem foi um toque (ver esperarOAssunto). */
  tituloDoToque?: string | null
  /**
   * O robo registrou "nao entendi" nesta mensagem? A resposta dele nem sempre
   * comeca assim: o naoEntendi tambem devolve a frase clinica ou uma resposta
   * pronta. Ver roboRegistrou.
   */
  roboNaoEntendeuAgora?: () => boolean
  prazoMs?: number
}): Promise<Desfecho> {
  const naoEntendeu = (r: Resultado | null) => roboNaoEntendeu(r) || Boolean(opcoes.roboNaoEntendeuAgora?.())
  const { modo, situacao, ferramentas, chamar, roboDireto } = opcoes
  const modelo = opcoes.modelo || MODELO_PADRAO
  // 15 s, como no sistema do Dr. Marcello desde 17/10/2026: o Sonnet com duas
  // voltas de ferramenta passava dos 12.
  const prazo = opcoes.prazoMs ?? 15_000
  if (modo === 'desligado') return { resultado: await roboDireto(), origem: 'robo', eventos: [] }

  if (!chamar) {
    console.warn('Atendente com IA ligado sem ANTHROPIC_API_KEY: seguindo com o robo')
    return { resultado: await roboDireto(), origem: 'robo', eventos: [{ evento: 'ia_falhou', detalhe: 'sem chave' }] }
  }

  const doRobo = ficaComORobo(situacao)
  const emEtapa = Boolean(situacao.etapa && situacao.etapa !== 'menu' && situacao.etapa !== 'atendente')

  if (modo === 'sombra') {
    const resultado = await roboDireto()
    if (doRobo === 'risco_de_vida') {
      return {
        resultado,
        origem: 'robo',
        eventos: [{ evento: 'ia_sombra', detalhe: 'risco_de_vida' }],
        nota: `🤖 Claude (modo sombra): com a IA ligada, esta mensagem teria a resposta pronta de risco de vida (${sinalDeAlarme(situacao.texto)?.nome}):\n\n${RISCO_DE_VIDA}`,
      }
    }
    if (doRobo) return { resultado, origem: 'robo', eventos: [] }
    // Em etapa, so quando o robo nao entendeu - e quando o Claude entraria de verdade.
    if (emEtapa && !naoEntendeu(resultado) && !soPerguntaNoPassoDeDado(situacao)) return { resultado, origem: 'robo', eventos: [] }
    try {
      const mentira = ferramentasDeMentira(ferramentas)
      const { resultado: dele } = await conversarComClaude(situacao, mentira, chamar, modelo, emEtapa, prazo)
      const acoes = mentira.feito.length ? `\n\n[${mentira.feito.join('; ')}]` : ''
      return {
        resultado,
        origem: 'robo',
        eventos: [{ evento: 'ia_sombra' }],
        nota: `🤖 Claude (modo sombra) responderia:\n\n${comUrgenciaGarantida(situacao, dele)?.resposta ?? ''}${acoes}`.slice(0, 3900),
      }
    } catch (erro) {
      console.warn('Atendente com IA (sombra) falhou', erro)
      return { resultado, origem: 'robo', eventos: [{ evento: 'ia_falhou', detalhe: 'sombra' }] }
    }
  }

  // Ligado.
  // Risco de vida: a resposta pronta, sem esperar o Claude. A conversa vai para
  // a equipe com a etiqueta de urgencia, que acende o celular de quem atende.
  if (doRobo === 'risco_de_vida') {
    const sinal = sinalDeAlarme(situacao.texto)
    return {
      resultado: await ferramentas.equipe('urgencia', RISCO_DE_VIDA),
      origem: 'robo',
      eventos: [{ evento: 'ia_passou_ao_robo', detalhe: 'risco_de_vida' }],
      nota: `🚨 Sinal de risco de vida na mensagem (${sinal?.nome}): a resposta pronta mandou ao pronto-socorro ou ao 192. Mensagem: «${String(situacao.texto).slice(0, 400)}»`,
    }
  }
  if (doRobo) {
    return { resultado: await roboDireto(), origem: 'robo', eventos: [{ evento: 'ia_passou_ao_robo', detalhe: doRobo }] }
  }

  // Conversa encerrada e a pessoa so mandou um emoji ou "perfeito": silencio,
  // sem chamar o Claude (ver soFechamento). No passo do pedido quem decide e o robo.
  if (!emEtapa && fechouSemPergunta(situacao)) {
    return { resultado: null, origem: 'robo', eventos: [{ evento: 'ia_calou_no_fechamento' }] }
  }

  // Pediu a equipe sem dizer para que: primeiro o assunto (ver esperarOAssunto).
  const pedidoDeEquipe = esperarOAssunto({
    texto: situacao.texto,
    titulo: opcoes.tituloDoToque,
    etapa: situacao.etapa,
    ultimaDoConsultorio: situacao.ultimaDoConsultorio,
    equipeConversando: situacao.equipeConversando,
  })
  if (pedidoDeEquipe === 'esperar') {
    return { resultado: { resposta: ESPERA_DO_ASSUNTO }, origem: 'robo', eventos: [{ evento: 'equipe_espera_assunto' }] }
  }
  if (pedidoDeEquipe === 'equipe') {
    return {
      resultado: await ferramentas.equipe('atendente', EQUIPE_DEPOIS_DA_ESPERA),
      origem: 'robo',
      eventos: [{ evento: 'equipe_insistiu' }],
    }
  }

  // Toque numa opcao do menu vai ao robo (no sistema do Dr. Marcello,
  // 26/10/2026: a IA, lendo so o "1", devolveu o menu inteiro). A IA so entra se
  // o robo nao entender o toque.
  if (opcoes.tituloDoToque && !emEtapa) {
    const doRoboNoToque = await roboDireto()
    if (doRoboNoToque && !naoEntendeu(doRoboNoToque)) {
      return { resultado: doRoboNoToque, origem: 'robo', eventos: [{ evento: 'ia_passou_ao_robo', detalhe: 'toque' }] }
    }
  }

  if (emEtapa) {
    // So pergunta num passo de dado: a IA responde, e o robo nao grava a
    // pergunta como dado (ver soPerguntaNoPassoDeDado).
    const soPergunta = soPerguntaNoPassoDeDado(situacao)
    const doRoboNaEtapa = soPergunta ? null : await roboDireto()
    if (!soPergunta && !naoEntendeu(doRoboNaEtapa)) {
      // O robo entendeu o passo, mas a mensagem trazia tambem uma pergunta: a
      // IA responde so a pergunta, antes da tela do robo.
      const temPergunta = perguntaLateral(situacao.texto, PASSO_DE_ESCOLHA.test(situacao.etapa ?? ''))
      if (doRoboNaEtapa && temPergunta) {
        try {
          const extra = await responderPerguntaLateral(situacao, doRoboNaEtapa.resposta, chamar, modelo, Math.min(prazo, 10_000))
          if (extra.texto) {
            // A etiqueta do robo (o pedido anotado, a urgencia) vence a da duvida;
            // as so informativas, nao.
            const doRoboAtencao = doRoboNaEtapa.atencao && !['cancelou_sozinho', 'anexo'].includes(doRoboNaEtapa.atencao) ? doRoboNaEtapa.atencao : undefined
            const resultado = {
              ...doRoboNaEtapa,
              resposta: `${extra.texto}\n\n${doRoboNaEtapa.resposta}`,
              ...(extra.equipe ? { atencao: extra.equipe.motivo === 'urgencia' ? 'urgencia' as const : doRoboAtencao ?? (MOTIVOS[extra.equipe.motivo] ?? 'atendente') } : {}),
            }
            return {
              resultado: comUrgenciaGarantida(situacao, resultado),
              origem: 'ia',
              eventos: [{ evento: 'ia_respondeu', detalhe: extra.equipe ? 'pergunta junto do passo + equipe' : 'pergunta junto do passo' }],
              nota: extra.equipe ? `🤖 Resumo da IA para a equipe: ${extra.equipe.resumo}`.slice(0, 1500) : undefined,
            }
          }
        } catch (erro) {
          console.warn('Atendente com IA falhou na pergunta junto do passo; vale o robo', erro)
          return { resultado: doRoboNaEtapa, origem: 'robo', eventos: [{ evento: 'ia_falhou', detalhe: String(erro).slice(0, 120) }] }
        }
      }
      // Sinal de urgencia junto da resposta do passo ("so de manha, ela esta muito
      // fraca"): o robo segue o pedido e a conversa fica marcada como urgente.
      return { resultado: comUrgenciaGarantida(situacao, doRoboNaEtapa), origem: 'robo', eventos: [] }
    }
    // Pergunta solta no passo de escolha: a IA responde so a duvida, e a tela
    // que vai embaixo e a do robo, igual.
    const tela = telaDoPasso(doRoboNaEtapa)
    if (
      tela && doRoboNaEtapa && PASSO_DE_ESCOLHA.test(situacao.etapa ?? '') && perguntaLateral(situacao.texto) &&
      !relatoDeSintoma(situacao.texto) && !PEDIDO_NO_PASSO.test(semAcento(situacao.texto))
    ) {
      try {
        const extra = await responderPerguntaLateral(situacao, tela, chamar, modelo, Math.min(prazo, 10_000), SO_A_DUVIDA)
        if (extra.texto) {
          return {
            resultado: comUrgenciaGarantida(situacao, {
              ...doRoboNaEtapa,
              resposta: `${extra.texto}\n\n${tela}`,
              ...(extra.equipe ? { atencao: extra.equipe.motivo === 'urgencia' ? 'urgencia' as const : (MOTIVOS[extra.equipe.motivo] ?? 'atendente') } : {}),
            }),
            origem: 'ia',
            eventos: [{ evento: 'ia_respondeu', detalhe: extra.equipe ? 'pergunta no passo + equipe' : 'pergunta no passo' }],
            nota: extra.equipe ? `🤖 Resumo da IA para a equipe: ${extra.equipe.resumo}`.slice(0, 1500) : undefined,
          }
        }
      } catch (erro) {
        console.warn('Atendente com IA falhou na pergunta do passo; vale o robo', erro)
        return { resultado: doRoboNaEtapa, origem: 'robo', eventos: [{ evento: 'ia_falhou', detalhe: String(erro).slice(0, 120) }] }
      }
    }
    try {
      const { resultado, acao, nota } = await conversarComClaude(situacao, ferramentas, chamar, modelo, true, prazo)
      return { resultado: comUrgenciaGarantida(situacao, resultado), origem: 'ia', eventos: [{ evento: 'ia_respondeu', detalhe: acao }], nota }
    } catch (erro) {
      console.warn('Atendente com IA falhou na etapa; vale o robo', erro)
      const eventos = [{ evento: 'ia_falhou', detalhe: String(erro).slice(0, 120) }]
      if (sinalDeAlarme(situacao.texto)) {
        return { resultado: await ferramentas.equipe('urgencia', URGENTE_SEM_IA, { manterEtapa: passoDeDado(situacao) }), origem: 'robo', eventos }
      }
      // A pergunta que a IA ia responder no passo de dado: o robo grava como
      // sempre, que e o que acontecia antes da IA.
      return { resultado: doRoboNaEtapa ?? (await roboDireto()), origem: 'robo', eventos }
    }
  }

  try {
    const { resultado, acao, nota } = await conversarComClaude(situacao, ferramentas, chamar, modelo, false, prazo)
    return { resultado: comUrgenciaGarantida(situacao, resultado), origem: 'ia', eventos: [{ evento: 'ia_respondeu', detalhe: acao }], nota }
  } catch (erro) {
    console.warn('Atendente com IA falhou; o robo responde', erro)
    const eventos = [{ evento: 'ia_falhou', detalhe: String(erro).slice(0, 120) }]
    // Risco de vida na conversa e a IA fora: o pronto-socorro agora, e nunca o
    // botao de marcar (no sistema do Dr. Marcello, rodada 13).
    if (riscoDeVida(situacao) && !jaNoProntoSocorro(situacao)) {
      const daEquipe = await ferramentas.equipe('urgencia', `${PRONTO_SOCORRO_AGORA}\n\nA consulta não substitui essa avaliação. Depois do pronto-socorro, é só voltar aqui que a gente faz o pedido.`)
      return { resultado: daEquipe ?? { resposta: PRONTO_SOCORRO_AGORA, atencao: 'urgencia' }, origem: 'robo', eventos: [...eventos, { evento: 'ia_falhou_risco_de_vida' }] }
    }
    // O robo daqui nao conhece os sinais de alarme: sem a IA, a resposta pronta.
    if (sinalDeAlarme(situacao.texto)) {
      return { resultado: await ferramentas.equipe('urgencia', URGENTE_SEM_IA), origem: 'robo', eventos: [...eventos, { evento: 'ia_falhou_urgencia' }] }
    }
    const doRoboNaFalha = await roboDireto()
    if (doRoboNaFalha) return { resultado: doRoboNaFalha, origem: 'robo', eventos }
    // Na fila da equipe o robo fica calado de proposito - mas quem respondia
    // ali era a IA, e ela falhou. Silencio nunca: a pessoa sabe que a equipe viu.
    return {
      resultado: await ferramentas.equipe('atendente', 'Recebi sua mensagem e já passei para a equipe, que responde por aqui.'),
      origem: 'robo',
      eventos: [...eventos, { evento: 'ia_falhou_sem_robo' }],
    }
  }
}

// O mesmo atalho de respostas.ts: o cliente do Supabase sem os tipos gerados.
type Admin = { from: (tabela: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * O que o Claude precisa saber desta conversa, lido do banco. Cada leitura em
 * try/catch: sem historico ele responde so a mensagem; sem os textos da
 * clinica, chama a equipe para tudo o que nao souber (as instrucoes mandam).
 */
export async function montarSituacao(
  admin: Admin,
  p: {
    clinicId: string
    conversationId: string
    texto: string
    anexo: boolean
    etapa: string | null
    pacientes: string[]
    consultas: ConsultaMarcada[]
    quemAtende: string
    agora: Date
    equipeConversando: boolean
    urgenciaAberta?: boolean
  },
): Promise<Situacao> {
  let historico: Situacao['historico'] = []
  try {
    const { data, error } = await admin
      .from('whatsapp_messages')
      .select('direction,body,created_at')
      .eq('conversation_id', p.conversationId)
      .order('created_at', { ascending: false })
      .limit(24)
    if (error) throw error
    historico = ((data ?? []) as { direction: string; body: string | null }[])
      .reverse()
      .filter((m) => (m.body ?? '').trim())
      .map((m) => ({ de: m.direction === 'inbound' ? ('pessoa' as const) : ('consultorio' as const), texto: String(m.body) }))
  } catch (erro) {
    console.warn('Atendente com IA sem o historico da conversa', erro)
  }
  // A mensagem nova ja foi gravada antes do robo: sai do historico para nao repetir.
  const ultima = historico.at(-1)
  if (ultima && ultima.de === 'pessoa' && ultima.texto.trim() === p.texto.trim()) historico.pop()
  const ultimaDoConsultorio = [...historico].reverse().find((m) => m.de === 'consultorio')?.texto ?? null

  let conhecimento = ''
  try {
    conhecimento = await conhecimentoDaClinica(admin as never, p.clinicId)
  } catch (erro) {
    console.warn('Atendente com IA sem os textos da clinica', erro)
  }
  let valor: string | null = null
  try {
    valor = valorCadastrado(await carregarRespostas(admin, p.clinicId))
  } catch (erro) {
    console.warn('Atendente com IA sem o valor cadastrado', erro)
  }

  const consultas = p.consultas.map((c) => {
    const quando = new Date(c.inicio).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    const de = (c.paciente ?? '').trim().split(/\s+/)[0]
    return `${quando} · ${c.unidade}${de ? ` · ${de}` : ''}`
  })

  return {
    texto: p.texto,
    anexo: p.anexo,
    etapa: p.etapa,
    ultimaDoConsultorio,
    historico,
    pacientes: p.pacientes,
    consultas,
    conhecimento,
    valor,
    quemAtende: p.quemAtende,
    agora: p.agora,
    equipeConversando: p.equipeConversando,
    urgenciaAberta: p.urgenciaAberta ?? false,
  }
}
