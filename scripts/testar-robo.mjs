// Roda os testes do robo: monta cada modulo com o esbuild e roda cada teste, em ordem,
// parando no primeiro que falhar (o mesmo que o antigo "a && b && c" do package.json).
//
// Por que um arquivo (07/11/2026, como no sistema do Dr. Marcello desde 28/10): a lista
// morava inteira no package.json, numa linha so, e ja passava de 6.300 caracteres. O cmd
// do Windows corta em 8191: la, o npm respondeu "Linha de comando muito longa" e nao rodou
// teste nenhum, e o PUBLICAR.bat (que roda npm run test:bot antes de enviar) teria
// travado a publicacao. Teste novo entra aqui.
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = path.join(raiz, 'node_modules', '.bin')
const env = { ...process.env, PATH: bin + path.delimiter + (process.env.PATH ?? '') }

// esbuild <argumentos>
const MONTAGENS = [
  "supabase/functions/_shared/atendimento.ts --bundle --format=esm --outfile=tests/atendimento.build.mjs",
  "supabase/functions/_shared/lembrete.ts --bundle --format=esm --outfile=tests/lembrete.build.mjs",
  "supabase/functions/_shared/texto-do-prontuario.ts --format=esm --outfile=tests/prontuario.build.mjs",
  "supabase/functions/_shared/datas.ts --format=esm --outfile=tests/datas.build.mjs",
  "src/lib/receita-no-texto.ts --bundle --format=esm --outfile=tests/receita-no-texto.build.mjs",
  "supabase/functions/_shared/nome.ts --format=esm --outfile=tests/nome.build.mjs",
  "src/lib/categoria-da-receita.ts --format=esm --outfile=tests/categoria-da-receita.build.mjs",
  "src/lib/mascaras.ts --format=esm --outfile=tests/mascaras.build.mjs",
  "supabase/functions/_shared/eventos-do-webhook.ts --format=esm --outfile=tests/eventos-do-webhook.build.mjs",
  "supabase/functions/_shared/expediente.ts --format=esm --outfile=tests/expediente.build.mjs",
  "supabase/functions/_shared/papel.ts --format=esm --outfile=tests/papel.build.mjs",
  "src/lib/paginar.ts --format=esm --outfile=tests/paginar.build.mjs",
  "supabase/functions/_shared/alergias.ts --format=esm --outfile=tests/alergias.build.mjs",
  "src/lib/dados-para-memed.ts --format=esm --outfile=tests/dados-para-memed.build.mjs",
  "src/lib/memed-na-pagina.ts --format=esm --outfile=tests/memed-na-pagina.build.mjs",
  "src/lib/memed-carga.ts --format=esm --outfile=tests/memed-carga.build.mjs",
  "src/lib/gravacao-de-audio.ts --format=esm --outfile=tests/gravacao-de-audio.build.mjs",
  "supabase/functions/_shared/arquivo-da-resposta.ts --format=esm --outfile=tests/arquivo-da-resposta.build.mjs",
  "src/lib/continuidade-da-consulta.ts --format=esm --outfile=tests/continuidade-da-consulta.build.mjs",
  "src/lib/retorno.ts --format=esm --outfile=tests/retorno.build.mjs",
  "src/lib/followup.ts --bundle --format=esm --alias:@=./src --outfile=tests/followup.build.mjs",
  "supabase/functions/_shared/telefone-br.ts --format=esm --outfile=tests/telefone-br.build.mjs",
  "supabase/functions/_shared/mensagem-recebida.ts --format=esm --outfile=tests/mensagem-recebida.build.mjs",
  "src/lib/linha-do-tempo.ts --format=esm --outfile=tests/linha-do-tempo.build.mjs",
  "src/lib/saude-dos-envios.ts --format=esm --outfile=tests/saude-dos-envios.build.mjs",
  "src/lib/bloqueio-de-dia.ts --format=esm --outfile=tests/bloqueio-de-dia.build.mjs",
  "supabase/functions/_shared/modelos.ts --format=esm --outfile=tests/modelos.build.mjs",
  "supabase/functions/_shared/documento.ts --format=esm --outfile=tests/documento.build.mjs",
  "src/lib/remanejar.ts --format=esm --outfile=tests/remanejar.build.mjs",
  "supabase/functions/_shared/lembrete-envio.ts --bundle --format=esm --outfile=tests/lembrete-envio.build.mjs",
  "src/lib/situacao-da-confirmacao.ts --format=esm --outfile=tests/situacao-da-confirmacao.build.mjs",
  "supabase/functions/_shared/robo-da-conversa.ts --format=esm --outfile=tests/robo-da-conversa.build.mjs",
  "supabase/functions/_shared/bloqueio.ts --format=esm --outfile=tests/bloqueio.build.mjs",
  "supabase/functions/_shared/bom-dia-da-equipe.ts --bundle --format=esm --outfile=tests/bom-dia-da-equipe.build.mjs",
  "supabase/functions/_shared/depois-do-convenio.ts --bundle --format=esm --outfile=tests/depois-do-convenio.build.mjs",
  "src/lib/cadastro-do-paciente.ts --bundle --format=esm --alias:@=./src --outfile=tests/cadastro-do-paciente.build.mjs",
  "supabase/functions/_shared/whatsapp-teste.ts --bundle --format=esm --outfile=tests/whatsapp-teste.build.mjs",
  "supabase/functions/_shared/quem-atende.ts --format=esm --outfile=tests/quem-atende.build.mjs",
  "supabase/functions/_shared/web-push.ts --format=esm --outfile=tests/web-push.build.mjs",
  "supabase/functions/_shared/aviso-da-equipe.ts --format=esm --outfile=tests/aviso-da-equipe.build.mjs",
  "supabase/functions/_shared/instagram.ts --bundle --format=esm --outfile=tests/instagram.build.mjs",
  "supabase/functions/_shared/origem-do-anuncio.ts --format=esm --outfile=tests/origem-do-anuncio.build.mjs",
  "src/lib/valores-enviados.ts --format=esm --outfile=tests/valores-enviados.build.mjs",
  "supabase/functions/_shared/meta-tentativa.ts --format=esm --outfile=tests/meta-tentativa.build.mjs",
  "src/lib/telefone-do-lembrete.ts --format=esm --outfile=tests/telefone-do-lembrete.build.mjs",
  "src/lib/respostas-da-equipe.ts --format=esm --outfile=tests/respostas-da-equipe.build.mjs",
  "src/lib/sexo-pelo-nome.ts --format=esm --outfile=tests/sexo-pelo-nome.build.mjs",
  "supabase/functions/_shared/cadastro.ts --bundle --format=esm --outfile=tests/cadastro.build.mjs",
  "supabase/functions/_shared/consulta-aconteceu.ts --format=esm --outfile=tests/consulta-aconteceu.build.mjs",
  "src/lib/paciente-atendido.ts --bundle --format=esm --outfile=tests/paciente-atendido.build.mjs",
  "supabase/functions/_shared/alerta-de-urgencia.ts --bundle --format=esm --outfile=tests/alerta-de-urgencia.build.mjs",
  "supabase/functions/_shared/resposta-ao-alerta.ts --bundle --format=esm --outfile=tests/resposta-ao-alerta.build.mjs",
  "supabase/functions/_shared/assistente.ts --bundle --format=esm --outfile=tests/assistente.build.mjs",
  "supabase/functions/_shared/gastos-meta.ts --format=esm --outfile=tests/gastos-meta.build.mjs",
  "supabase/functions/_shared/gastos-google.ts --format=esm --outfile=tests/gastos-google.build.mjs",
  "src/lib/campanha.ts --format=esm --outfile=tests/campanha.build.mjs",
]

// node <arquivo>
const TESTES = [
  "tests/atendimento.test.mjs",
  "tests/lembrete.test.mjs",
  "tests/prontuario.test.mjs",
  "tests/vaga-cancelada.test.mjs",
  "tests/datas.test.mjs",
  "tests/receita-no-texto.test.mjs",
  "tests/nome.test.mjs",
  "tests/categoria-da-receita.test.mjs",
  "tests/mascaras.test.mjs",
  "tests/eventos-do-webhook.test.mjs",
  "tests/expediente.test.mjs",
  "tests/papel.test.mjs",
  "tests/paginar.test.mjs",
  "tests/alergias.test.mjs",
  "tests/dados-para-memed.test.mjs",
  "tests/memed-na-pagina.test.mjs",
  "tests/memed-carga.test.mjs",
  "tests/gravacao-de-audio.test.mjs",
  "tests/prontuario-novo.test.mjs",
  "tests/acompanhamentos.test.mjs",
  "tests/whatsapp-lote.test.mjs",
  "tests/whatsapp-teste.test.mjs",
  "tests/quem-atende.test.mjs",
  "tests/web-push.test.mjs",
  "tests/aviso-da-equipe.test.mjs",
  "tests/instagram.test.mjs",
  "tests/origem-do-anuncio.test.mjs",
  "tests/valores-enviados.test.mjs",
  "tests/meta-tentativa.test.mjs",
  "tests/telefone-do-lembrete.test.mjs",
  "tests/respostas-da-equipe.test.mjs",
  "tests/sexo-pelo-nome.test.mjs",
  "tests/cadastro.test.mjs",
  "tests/consulta-aconteceu.test.mjs",
  "tests/paciente-atendido.test.mjs",
  "tests/alerta-de-urgencia.test.mjs",
  "tests/resposta-ao-alerta.test.mjs",
  "tests/assistente.test.mjs",
  "tests/gastos-meta.test.mjs",
  "tests/gastos-google.test.mjs",
  "tests/campanha.test.mjs",
  "tests/documento.test.mjs",
  "tests/remanejar.test.mjs",
  "tests/lembrete-envio.test.mjs",
  "tests/situacao-da-confirmacao.test.mjs",
  "tests/robo-da-conversa.test.mjs",
  "tests/bloqueio.test.mjs",
  "tests/bom-dia-da-equipe.test.mjs",
  "tests/depois-do-convenio.test.mjs",
  "tests/cadastro-do-paciente.test.mjs",
]

function rodar(comando) {
  try {
    execSync(comando, { cwd: raiz, env, stdio: 'inherit' })
  } catch {
    console.error(`
✗ Falhou: ${comando}`)
    process.exit(1)
  }
}

for (const m of MONTAGENS) rodar(`esbuild ${m}`)
for (const t of TESTES) rodar(`node ${t}`)
console.log(`
Todos os ${TESTES.length} arquivos de teste passaram.`)
