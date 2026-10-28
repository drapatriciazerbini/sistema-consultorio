import { useEffect, useState } from 'react'
import { RefreshCw, Save, Send, Smartphone } from 'lucide-react'
import {
  getNumerosDoAviso,
  getUltimoAviso,
  numerosParaOAviso,
  saveNumerosDoAviso,
  telefoneLegivel,
  type UltimoAviso,
} from '@/lib/aviso-no-whatsapp'
import { testarAvisoDoPedido } from '@/lib/notificacoes'

/**
 * Cartao "Aviso no WhatsApp da Dra." em Preferencias (28/10/2026).
 *
 * Pedido do Edu em 27/10/2026: quem pede consulta ou visita pelo robo vira um
 * aviso no WhatsApp pessoal da Dra. Patricia, e ela responde o paciente por
 * la. Os numeros moram no banco, editaveis aqui, e nunca no codigo.
 *
 * O ultimo aviso e o botao de teste estao no cartao porque aviso que nao chega
 * nao avisa que nao chegou: modelo ainda em analise na Meta, numero digitado
 * errado. A pessoa aperta, ve (ou nao ve) chegar, e sabe na hora.
 */

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AvisoNoWhatsAppDaDra({ clinicId }: { clinicId: string | null }) {
  // null = banco sem a coluna (a migration ainda nao chegou).
  const [texto, setTexto] = useState<string | null>(null)
  const [salvo, setSalvo] = useState('')
  const [carregado, setCarregado] = useState(false)
  const [ultimo, setUltimo] = useState<UltimoAviso | null>(null)
  const [ocupado, setOcupado] = useState<'' | 'salvar' | 'testar'>('')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    if (!clinicId) return
    let vivo = true
    void getNumerosDoAviso(clinicId).then((numeros) => {
      if (!vivo) return
      setCarregado(true)
      if (numeros === null) return
      const lista = numeros.map(telefoneLegivel).join('\n')
      setTexto(lista)
      setSalvo(lista)
    })
    void getUltimoAviso(clinicId).then((linha) => {
      if (vivo) setUltimo(linha)
    })
    return () => {
      vivo = false
    }
  }, [clinicId])

  async function salvar() {
    if (!clinicId || texto === null) return
    const numeros = numerosParaOAviso(texto)
    // Linha que nao virou numero some calada? Nao: quem digitou errado precisa saber.
    const linhas = texto.split(/[\n,;]+/).filter((l) => l.trim()).length
    if (numeros.length < linhas) {
      setAviso({ tipo: 'erro', texto: 'Algum número não parece um celular com DDD. Confira e salve de novo.' })
      return
    }
    setAviso(null)
    setOcupado('salvar')
    try {
      await saveNumerosDoAviso(clinicId, numeros)
      const lista = numeros.map(telefoneLegivel).join('\n')
      setTexto(lista)
      setSalvo(lista)
      setAviso({
        tipo: 'ok',
        texto: numeros.length ? `Aviso salvo para ${numeros.length} número(s).` : 'Aviso desligado: nenhum número salvo.',
      })
    } catch (causa) {
      setAviso({ tipo: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível salvar os números.' })
    } finally {
      setOcupado('')
    }
  }

  async function testar() {
    if (!clinicId) return
    setAviso(null)
    setOcupado('testar')
    try {
      const r = await testarAvisoDoPedido(clinicId)
      setAviso({ tipo: r.falhou ? 'erro' : 'ok', texto: r.nota })
      setUltimo(await getUltimoAviso(clinicId))
    } catch (causa) {
      setAviso({ tipo: 'erro', texto: causa instanceof Error ? causa.message : 'O teste não saiu.' })
    } finally {
      setOcupado('')
    }
  }

  const ultimoFalhou = Boolean(ultimo?.resultado.startsWith('falhou'))

  return (
    <section className="surface-card overflow-hidden rounded-[26px]">
      <div className="border-b border-[#193d36]/[0.06] bg-gradient-to-r from-white to-[#f9f8f3] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#eae3d4] text-[#1f5f55]">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#1f5f55]">Pedidos de consulta</p>
            <h2 className="mt-1 text-base font-extrabold text-[#193d36]">Aviso no WhatsApp da Dra.</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#4d6b63]">
              Quando alguém pede consulta ou visita em casa pelo robô, a qualquer hora, estes celulares recebem no
              WhatsApp quem pediu, o horário e o resumo do pedido. Um número por linha, com DDD.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {!carregado ? (
          <p className="text-[11px] font-bold text-[#4d6b63]">Consultando…</p>
        ) : texto === null ? (
          <p className="rounded-2xl bg-[#f7f4ee] p-4 text-xs leading-relaxed text-[#6b5a3a]">
            Ainda não disponível: a atualização do banco não chegou. Depois do próximo PUBLICAR, recarregue a página.
          </p>
        ) : (
          <>
            <p className="text-[11px] leading-relaxed text-[#4d6b63]">
              <strong>O primeiro número é o da Dra. Patrícia.</strong> Pelo próprio WhatsApp ela toca em{' '}
              <strong>Eu respondo</strong> ou <strong>Mandar os valores</strong>, ou escreve a mensagem em cima do aviso, e
              o paciente recebe pelo número do consultório (o texto só sai depois de ela tocar em Enviar). Os outros
              números respondem como equipe.
            </p>
            <textarea
              aria-label="Celulares que recebem o aviso"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="(13) 99999-9999"
              className="w-full resize-y rounded-[14px] border border-[#193d36]/10 bg-[#f8f6f0] p-3 text-xs leading-relaxed text-[#193d36] outline-none focus:border-[#2f7f74]/50"
            />
            <p className={`text-[10px] font-bold leading-relaxed ${ultimoFalhou ? 'text-red-600' : 'text-[#4d6b63]'}`}>
              {ultimo
                ? `Último aviso: ${quando(ultimo.quando)}, ${ultimo.teste ? 'teste' : ultimo.quem || 'paciente'}, ${ultimo.resultado || 'sem resultado gravado'}.`
                : 'Nenhum aviso enviado ainda.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void testar()}
                disabled={ocupado !== '' || !salvo.trim() || texto !== salvo}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#193d36]/12 bg-white px-3 py-2.5 text-[11px] font-extrabold text-[#193d36] transition hover:bg-[#f6f4ee] disabled:opacity-50"
              >
                {ocupado === 'testar' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Mandar aviso de teste
              </button>
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={ocupado !== '' || texto === salvo}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#193d36] px-3 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#13453c] disabled:opacity-50"
              >
                {ocupado === 'salvar' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar números
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Usa os modelos <strong>aviso_pedido_consulta</strong> (com os botões) e{' '}
              <strong>aviso_pedido_consulta_simples</strong> (reserva sem botões), que precisam estar aprovados na Meta.
              Se o aviso não chegar, a conversa do paciente ganha uma nota para avisar a Dra. por telefone.
            </p>
          </>
        )}

        {aviso && (
          <p className={`text-[11px] font-bold leading-relaxed ${aviso.tipo === 'ok' ? 'text-[#1c6b3a]' : 'text-red-600'}`}>
            {aviso.texto}
          </p>
        )}
      </div>
    </section>
  )
}
