// Lembrete repetido (29/10/2026): o botao "Repetir confirmacao" da conversa e
// a repeticao automatica para quem nao respondeu, ate 3 lembretes no dia.
// Ver supabase/functions/_shared/lembrete-envio.ts. Dados inventados: o
// repositorio e publico.
import {
  LEMBRETES_POR_CONSULTA,
  mandarLembrete,
  parametrosDoLembrete,
  repetirOLembrete,
} from './lembrete-envio.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

// Horas no relogio de Sao Paulo (UTC-3).
const sp = (dia, hora, minuto = 0, segundo = 0) => new Date(Date.UTC(2026, 9, dia, hora + 3, minuto, segundo))

// --- Os parametros do modelo ---
{
  const p = parametrosDoLembrete(
    {
      starts_at: sp(30, 10, 40).toISOString(),
      modality: 'presencial',
      clinic_units: { name: 'Consultório (Gonzaga)', address: 'Rua Exemplo, 100, Gonzaga, Santos - SP' },
    },
    'Joana Teste',
    'America/Sao_Paulo',
  )
  // O modelo da Dra. diz "Local: {{4}}": vai o nome da unidade, sem endereco.
  confere(
    'parametros: nome, data e hora de Sao Paulo, nome da unidade',
    JSON.stringify(p) === JSON.stringify(['Joana Teste', '30/10/2026', '10:40', 'Consultório (Gonzaga)']),
    JSON.stringify(p),
  )
  const semNome = parametrosDoLembrete({ starts_at: sp(30, 15).toISOString(), modality: 'presencial', clinic_units: null }, 'Joana Teste', 'America/Sao_Paulo')
  confere('parametros: sem unidade, "a clínica"', semNome[3] === 'a clínica', semNome[3])
  const video = parametrosDoLembrete({ starts_at: sp(30, 15).toISOString(), modality: 'telemedicina', clinic_units: { name: 'Consultório (Gonzaga)' } }, 'Joana Teste', 'America/Sao_Paulo')
  confere('parametros: telemedicina diz por video, nao a unidade', video[3] === 'virtual (consulta por vídeo)', video[3])
}

// --- Quando perguntar de novo ---
{
  const daManha = sp(29, 9, 20, 5).toISOString()
  const r = repetirOLembrete({ envios: 1, ultimoEnvio: daManha, familiaEscreveu: false }, sp(29, 13, 20, 1).getTime())
  // 3h59m56s: a passada das 13:20 sai segundos antes de completar 4 horas.
  confere('13:20 repete o lembrete das 09:20', r.repetir, JSON.stringify(r))
  const cedo = repetirOLembrete({ envios: 1, ultimoEnvio: daManha, familiaEscreveu: false }, sp(29, 12, 20, 1).getTime())
  confere('12:20 ainda e cedo', !cedo.repetir, JSON.stringify(cedo))
  const terceiro = repetirOLembrete({ envios: 2, ultimoEnvio: sp(29, 13, 20, 4).toISOString(), familiaEscreveu: false }, sp(29, 17, 20, 2).getTime())
  confere('17:20 manda o terceiro', terceiro.repetir, JSON.stringify(terceiro))
  const quarto = repetirOLembrete({ envios: 3, ultimoEnvio: sp(29, 13, 20, 4).toISOString(), familiaEscreveu: false }, sp(30, 9, 20).getTime())
  confere('com 3 lembretes, para', !quarto.repetir, JSON.stringify(quarto))
  const respondeu = repetirOLembrete({ envios: 1, ultimoEnvio: daManha, familiaEscreveu: true }, sp(29, 13, 20, 1).getTime())
  confere('a familia escreveu qualquer coisa: para', !respondeu.repetir, JSON.stringify(respondeu))
  const ilegivel = repetirOLembrete({ envios: 1, ultimoEnvio: 'ontem', familiaEscreveu: false }, sp(29, 13, 20).getTime())
  confere('data ilegivel: na duvida, nao manda', !ilegivel.repetir, JSON.stringify(ilegivel))
  const semAnterior = repetirOLembrete({ envios: 0, ultimoEnvio: null, familiaEscreveu: false }, sp(29, 13, 20).getTime())
  confere('sem lembrete anterior nao e repeticao', !semAnterior.repetir, JSON.stringify(semAnterior))
  // A recepcao mandou um pelo botao as 11h: ele conta e empurra o proximo.
  const daEquipe = repetirOLembrete({ envios: 2, ultimoEnvio: sp(29, 11).toISOString(), familiaEscreveu: false }, sp(29, 13, 20).getTime())
  confere('lembrete da equipe as 11h: 13:20 ainda nao repete', !daEquipe.repetir, JSON.stringify(daEquipe))
}
{
  // O dia inteiro sem resposta, passada a passada (as :20, das 10h as 19h).
  const envios = [sp(29, 9, 20, 5).toISOString()]
  const saidas = []
  for (let hora = 10; hora <= 19; hora += 1) {
    const agora = sp(29, hora, 20, 1).getTime()
    const d = repetirOLembrete({ envios: envios.length, ultimoEnvio: envios.at(-1), familiaEscreveu: false }, agora)
    if (d.repetir) {
      envios.push(new Date(agora + 4000).toISOString())
      saidas.push(`${hora}:20`)
    }
  }
  confere(
    'dia sem resposta: 09:20, 13:20 e 17:20, e para',
    JSON.stringify(saidas) === JSON.stringify(['13:20', '17:20']) && envios.length === LEMBRETES_POR_CONSULTA,
    JSON.stringify(saidas),
  )
}

// --- O envio ---
const bancoFalso = ({ registroFalha = false } = {}) => {
  const inseridos = []
  return {
    inseridos,
    from: (tabela) => ({
      insert: async (linha) => {
        inseridos.push({ tabela, ...linha })
        return { error: registroFalha ? { message: 'sem conexao' } : null }
      },
    }),
  }
}
const envio = {
  clinicId: 'c1',
  conversationId: 'conversa1',
  patientId: 'p1',
  appointmentId: 'consulta1',
  waId: '5513999990303',
  phoneNumberId: 'numero1',
  token: 'token-de-teste',
  graphVersion: 'v25.0',
  modelo: 'lembrete_consulta',
  idioma: 'pt_BR',
  parametros: ['Joana Teste', '30/10/2026', '10:40', 'Livance · Santos (Av. Exemplo, 100)'],
  automatico: false,
}
const meta = (status, corpo) => async () => new Response(JSON.stringify(corpo), { status })

{
  const b = bancoFalso()
  const pedidos = []
  const buscar = async (url, init) => {
    pedidos.push({ url, corpo: JSON.parse(init.body) })
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.teste1' }] }), { status: 200 })
  }
  const r = await mandarLembrete(b, envio, { buscar, agora: () => sp(29, 15) })
  confere('envio: ok, com o id da Meta e registrado', r.ok && r.externalId === 'wamid.teste1' && r.registrado && r.quando === sp(29, 15).toISOString(), JSON.stringify(r))
  const corpo = pedidos[0]?.corpo
  confere('envio: o modelo do lembrete, para o numero da conversa', corpo?.type === 'template' && corpo.template.name === 'lembrete_consulta' && corpo.to === '5513999990303' && pedidos[0].url.endsWith('/numero1/messages'), JSON.stringify(corpo))
  confere('envio: os 4 parametros na ordem', JSON.stringify(corpo?.template.components[0].parameters.map((p) => p.text)) === JSON.stringify(envio.parametros), JSON.stringify(corpo?.template))
  const m = b.inseridos[0]
  // E pela consulta na mensagem que o toque em "Confirmar presenca" acha o que confirmar.
  confere('registro: na conversa, com a consulta e o id da Meta', m?.tabela === 'whatsapp_messages' && m.appointment_id === 'consulta1' && m.conversation_id === 'conversa1' && m.external_message_id === 'wamid.teste1', JSON.stringify(m))
  confere('registro: da equipe, aceito, com o nome do modelo', m?.automatic === false && m.status === 'accepted' && m.template_name === 'lembrete_consulta' && m.direction === 'outbound', JSON.stringify(m))
  confere('registro: o texto que o paciente leu, com os botoes', m?.body.includes('Lembrete da consulta com a Dra. Patrícia Zerbini em 30/10/2026, às 10:40') && m.body.includes('[Confirmar presença · Preciso remarcar]'), m?.body)
}
{
  // Recusa da Meta: fica na conversa como "falhou", com o motivo.
  const b = bancoFalso()
  const r = await mandarLembrete(b, { ...envio, automatico: true }, { buscar: meta(400, { error: { code: 132001, message: 'Template name does not exist in the translation' } }) })
  confere('recusa: nao ok, e diz que o modelo nao esta aprovado', !r.ok && r.naoAprovado && r.motivo.includes('Template'), JSON.stringify(r))
  const m = b.inseridos[0]
  confere('recusa: na conversa como falhou, com a consulta', m?.status === 'failed' && m.failure_reason.includes('Template') && m.appointment_id === 'consulta1' && m.automatic === true, JSON.stringify(m))
  const outra = await mandarLembrete(bancoFalso(), envio, { buscar: meta(400, { error: { code: 131026, message: 'Message undeliverable' } }) })
  confere('recusa de outro tipo: nao e "modelo nao aprovado"', !outra.ok && !outra.naoAprovado, JSON.stringify(outra))
}
{
  // Saiu, mas o registro falhou: o botao precisa dizer isso a equipe.
  const r = await mandarLembrete(bancoFalso({ registroFalha: true }), envio, { buscar: meta(200, { messages: [{ id: 'wamid.teste2' }] }) })
  confere('registro falhou: ok, mas registrado = false', r.ok && r.registrado === false, JSON.stringify(r))
}

console.log(`lembrete repetido: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.error(`✗ ${f}`)
  process.exit(1)
}
