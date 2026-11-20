import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { Copy, ExternalLink, QrCode, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useVoltarDoCelular } from '@/lib/voltar-do-celular'
import { mascararTelefone } from '@/lib/mascaras'
import { linkDoWhatsApp, numeroNacional } from '@/lib/abrir-no-whatsapp'

/**
 * "Abrir no meu WhatsApp" (porte de 20/11/2026 do sistema do Dr. Marcello,
 * ver abrir-no-whatsapp.ts): o QR code da conversa do paciente, para a camera
 * do celular.
 */

export interface ContatoParaOQr {
  nome: string
  telefone: string
}

/**
 * O QR e desenhado aqui mesmo, em SVG. Nada de servico de fora: o telefone do
 * paciente nao sai do navegador para virar imagem em servidor de terceiro.
 */
function Codigo({ texto }: { texto: string }) {
  const { lado, caminho } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(texto)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) if (qr.isDark(l, c)) d += `M${c} ${l}h1v1h-1z`
    return { lado: n, caminho: d }
  }, [texto])
  return (
    <svg
      viewBox={`-2 -2 ${lado + 4} ${lado + 4}`}
      className="h-[220px] w-[220px]"
      role="img"
      aria-label="Código QR da conversa"
      shapeRendering="crispEdges"
    >
      <rect x={-2} y={-2} width={lado + 4} height={lado + 4} fill="#ffffff" />
      <path d={caminho} fill="#193d36" />
    </svg>
  )
}

/** O icone que abre a janela. `escuro` para a linha verde-escura da Agenda. */
export function BotaoDoQr({ nome, onClick, escuro = false }: { nome: string; onClick: () => void; escuro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Abrir no meu WhatsApp (QR code)"
      aria-label={`Abrir a conversa de ${nome} no meu WhatsApp`}
      className={
        escuro
          ? 'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25'
          : 'rounded-lg p-1 text-slate-400 transition hover:bg-[#eef3f2] hover:text-[#2f7f74]'
      }
    >
      <QrCode className={escuro ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
    </button>
  )
}

export default function AbrirNoMeuWhatsApp({ contato, onFechar }: { /** null = fechado. */ contato: ContatoParaOQr | null; onFechar: () => void }) {
  useVoltarDoCelular(contato !== null, onFechar)
  return <Dialog open={contato !== null}>{contato && <Aberto key={contato.telefone} contato={contato} onFechar={onFechar} />}</Dialog>
}

function Aberto({ contato, onFechar }: { contato: ContatoParaOQr; onFechar: () => void }) {
  const [copiado, setCopiado] = useState<'sim' | 'falhou' | null>(null)
  const link = linkDoWhatsApp(contato.telefone)
  const numero = numeroNacional(contato.telefone)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(numero)
      setCopiado('sim')
    } catch {
      // Navegador sem permissao de copiar: dizer, em vez de fingir que copiou.
      setCopiado('falhou')
    }
  }

  const botao =
    'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#193d36]/15 bg-white px-4 py-2.5 text-[12px] font-extrabold text-[#193d36] transition hover:bg-[#eef3f2]'

  return (
    <DialogContent
      onEscapeKeyDown={(e) => {
        e.preventDefault()
        onFechar()
      }}
      onInteractOutside={(e) => {
        e.preventDefault()
        onFechar()
      }}
      onCloseAutoFocus={(e) => e.preventDefault()}
      showCloseButton={false}
      className="max-w-[460px] rounded-[24px] p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <DialogTitle className="text-[20px] font-extrabold text-[#193d36]">Abrir no meu WhatsApp</DialogTitle>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-[#193d36]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {link ? (
        <>
          <DialogDescription className="text-center text-[12.5px] leading-relaxed text-slate-600">
            Aponte a câmera do celular para o código. A conversa com <strong className="text-[#193d36]">{contato.nome}</strong> abre no
            WhatsApp desse celular, sem precisar salvar o contato.
          </DialogDescription>
          <div className="mx-auto mt-1 rounded-[20px] border border-[#193d36]/10 bg-white p-4">
            <Codigo texto={link} />
          </div>
          <p className="text-center text-[16px] font-extrabold tabular-nums text-[#193d36]">{mascararTelefone(numero)}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => void copiar()} className={botao}>
              <Copy className="h-3.5 w-3.5" />
              {copiado === 'sim' ? 'Número copiado' : copiado === 'falhou' ? 'Não deu para copiar' : 'Copiar o número'}
            </button>
            <a href={link} target="_blank" rel="noopener noreferrer" className={botao}>
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir neste computador
            </a>
          </div>
          <p className="text-center text-[10.5px] leading-relaxed text-slate-400">
            No celular do consultório, a mensagem sai pelo número do consultório e aparece na Central. Num celular pessoal, sai do
            número pessoal e não fica guardada na Central.
          </p>
        </>
      ) : (
        <DialogDescription className="text-[12.5px] leading-relaxed text-[#b42318]">
          O telefone de {contato.nome} não parece um celular completo ({contato.telefone || 'vazio'}). Confira o número no cadastro antes
          de chamar.
        </DialogDescription>
      )}
    </DialogContent>
  )
}
