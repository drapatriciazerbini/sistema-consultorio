/**
 * Gasto do Google Ads para a aba Campanha da Visao geral (07/11/2026, portado do sistema do Dr. Marcello).
 *
 * Duas portas:
 *
 *   script do Google Ads (header x-chave-google), de hora em hora: o script
 *     que o Edu colou na conta manda o custo por dia e por campanha. A chave
 *     diz de qual clinica e; o banco guarda so o sha-256 dela.
 *
 *   tela (sessao do dono da clinica):
 *     gerar_chave  cria a chave e devolve o script pronto para colar (uma vez;
 *                  a tela nunca mais ve a chave). Gerar outra desliga a antiga.
 *     desligar     apaga a chave; os numeros ja recebidos ficam.
 *
 * Por que script e nao a API: a API do Google Ads exige token de desenvolvedor
 * aprovado pelo Google (ver _shared/gastos-google.ts).
 *
 * Falha barulhenta: relatorio recusado ou erro avisado pelo proprio script vai
 * para campanha_gastos.google_erro e aparece na tela; o script tambem falha de
 * proposito, e o Google manda e-mail. Se o script parar de rodar, a tela avisa
 * pelo tempo desde a ultima noticia (src/lib/campanha.ts, situacaoDoGoogle).
 */
import { adminClient, json, userClient } from '../_shared/whatsapp.ts'
import { DESDE_GOOGLE, MAIOR_CORPO, erroDoScript, hashDaChave, novaChave, scriptDoGoogleAds, validarRelatorio } from '../_shared/gastos-google.ts'

type Admin = ReturnType<typeof adminClient>

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function gravar(admin: Admin, clinicId: string, campos: Record<string, unknown>) {
  const { data, error } = await admin
    .from('campanha_gastos')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('clinic_id', clinicId)
    .select('clinic_id')
  if (error) throw new Error(`não consegui gravar o gasto do Google: ${error.message}`)
  // Update sem linha nao da erro: a chave seria entregue sem nada gravado, e o script recusado para sempre.
  if (!data?.length) throw new Error('a clínica não tem a linha de gastos das campanhas')
}

async function doScript(admin: Admin, req: Request, chave: string): Promise<Response> {
  const hash = await hashDaChave(chave)
  const { data: linha, error } = await admin.from('campanha_gastos').select('clinic_id').eq('google_chave_hash', hash).maybeSingle()
  if (error) {
    console.error('gastos-google: nao li campanha_gastos', error)
    return json({ error: error.message }, 500)
  }
  // Chave antiga (gerada outra) ou inventada: o script falha e o Google avisa por e-mail.
  if (!linha) return json({ error: 'Chave desconhecida: gere o script de novo na aba Campanha da Central.' }, 401)
  const clinicId = (linha as { clinic_id: string }).clinic_id

  const texto = await req.text()
  if (texto.length > MAIOR_CORPO) return json({ error: 'Relatório grande demais.' }, 413)
  let corpo: unknown
  try {
    corpo = JSON.parse(texto)
  } catch {
    corpo = null
  }

  const avisado = erroDoScript(corpo)
  if (avisado) {
    console.warn('gastos-google: o script avisou erro', clinicId, avisado)
    await gravar(admin, clinicId, { google_erro: avisado, google_erro_em: new Date().toISOString() })
    return json({ ok: true, registrado: 'erro' })
  }

  const v = validarRelatorio(corpo)
  if (!v.ok) {
    console.warn('gastos-google: relatorio recusado', clinicId, v.erro)
    await gravar(admin, clinicId, { google_erro: `Relatório do Google recusado: ${v.erro}`, google_erro_em: new Date().toISOString() }).catch((falha) =>
      console.error('gastos-google: nem o erro consegui gravar', falha),
    )
    return json({ error: v.erro }, 400)
  }

  const r = v.relatorio
  await gravar(admin, clinicId, {
    google_automatico: { desde: r.desde, ate: r.ate, dias: r.dias, campanhas: r.campanhas },
    google_automatico_em: new Date().toISOString(),
    google_conta: r.conta,
    google_erro: null,
    google_erro_em: null,
  })
  const total = Object.values(r.dias).reduce((a, b) => a + b, 0)
  return json({ ok: true, dias: Object.keys(r.dias).length, total: Math.round(total * 100) / 100 })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const admin = adminClient()

  // ------------------------------------------------------------ script do Google Ads
  const chave = req.headers.get('x-chave-google')?.trim()
  if (chave) {
    try {
      return await doScript(admin, req, chave)
    } catch (erro) {
      console.error('gastos-google: falhou com o relatorio do script', erro)
      return json({ error: (erro as Error).message || 'Falha ao gravar o gasto do Google.' }, 500)
    }
  }

  // ------------------------------------------------------------ tela
  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Sessão obrigatória.' }, 401)
    const { data: usuario } = await userClient(authorization).auth.getUser()
    if (!usuario?.user?.id) return json({ error: 'Sessão obrigatória.' }, 401)

    const pedido = (await req.json().catch(() => ({}))) as { acao?: string; clinicId?: string }
    const clinicId = String(pedido.clinicId ?? '')
    if (!clinicId) return json({ error: 'Clínica não informada.' }, 400)

    const { data: vinculo } = await admin
      .from('clinic_memberships')
      .select('role')
      .eq('clinic_id', clinicId)
      .eq('user_id', usuario.user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!vinculo) return json({ error: 'Você não faz parte desta clínica.' }, 403)
    // Gasto e dinheiro da clinica: so o dono liga (como a RLS da tabela e a gastos-meta).
    if (vinculo.role !== 'owner') return json({ error: 'Só o responsável pela clínica mexe no gasto das campanhas.', code: 'SO_DONO' }, 403)

    if (pedido.acao === 'gerar_chave') {
      const nova = novaChave()
      await gravar(admin, clinicId, {
        google_chave_hash: await hashDaChave(nova),
        google_chave_criada_em: new Date().toISOString(),
        google_erro: null,
        google_erro_em: null,
      })
      const url = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1/gastos-google`
      return json({ ok: true, script: scriptDoGoogleAds({ url, chave: nova, desde: DESDE_GOOGLE }) })
    }

    if (pedido.acao === 'desligar') {
      await gravar(admin, clinicId, { google_chave_hash: null, google_chave_criada_em: null })
      return json({ ok: true })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (erro) {
    console.error('gastos-google: falhou', erro)
    return json({ error: (erro as Error).message || 'Falha no gasto do Google.' }, 500)
  }
})
