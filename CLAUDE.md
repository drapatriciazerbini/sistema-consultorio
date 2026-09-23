# Central de Cuidado — Dra. Patrícia Zerbini

Sistema de acompanhamento clínico, agenda e atendimento por WhatsApp do
consultório da Dra. Patrícia Zerbini: clínica médica com pós-graduação em
geriatria, atendimento no consultório (Gonzaga, Santos) e em visita domiciliar.
Um erro aqui não é um bug: é um paciente idoso sem lembrete de consulta, ou um
pedido de receita que some.

É uma cópia adaptada do sistema do Dr. Marcello Ruiz
(`C:\Users\Edu\Desktop\dr marcelo\sistema-followup`). Aquele sistema é só
origem: nada se altera nele a partir daqui. Melhorias feitas lá entram aqui por
porte, adaptando nomes, textos, cores e o projeto Supabase
(`nvsxgvtwmcivdmrtpdqx`).

Stack: React 19 + TypeScript + Vite + Tailwind no navegador; Supabase (Postgres
com RLS forçada, Edge Functions em Deno, Storage) no servidor.

## Publicação

`PUBLICAR.bat` → commit → push → GitHub Actions. O fluxo confere lint, build e
testes **antes** de enviar; se algo falha, nada sobe e a produção continua
inteira.

No Actions a ordem é deliberada: **as migrations rodam primeiro**, e site e Edge
Functions só sobem se o banco passar. Isso existe porque em 17/09/2026 uma
migration quebrada deixou três dias de alterações paradas enquanto o código novo
subia pedindo colunas que não chegaram — e o robô respondeu o menu três vezes
seguidas para uma paciente de verdade.

## Migrations: a regra que não se quebra

**Migration aplicada nunca se edita.** Uma correção vem em arquivo novo, na
frente. Arquivo que FALHOU pode ser editado, porque nunca chegou a aplicar.

`supabase db push` **para na primeira migration que falha** e bloqueia todas as
seguintes. Uma linha errada trava o banco inteiro até alguém perceber.

## Coluna nova: o Postgres recusa a query inteira

Quando o código pede uma coluna que o banco ainda não tem, o Postgres **não
ignora o campo desconhecido — ele recusa o SELECT ou o UPDATE inteiro.** E as
Edge Functions costumam subir antes das migrations.

O padrão da casa, portanto: coluna recém-criada é lida em **consulta separada,
dentro de try/catch**, para que a falta dela custe o campo novo e não a tela
toda. Exemplos no código: `fichasDasConsultas`, `anexosDasMensagens`,
`COLUNAS_RECENTES` em `salvarEstado`, o plano B do INSERT em `marcar()`.

Perder o campo novo é arranhão. Perder o estado da conversa trava o atendimento.

## Falha silenciosa é pior que falha barulhenta

Dois defeitos custaram semanas por não gritar:

- O lembrete da véspera parou por um erro de maiúsculas no nome do segredo do
  cron. O agendador marcava sucesso (a requisição foi feita); quem recusava era
  o outro lado. Três semanas sem lembrete, sem um erro em lugar nenhum.
- O robô entrou em laço porque um SELECT pedia coluna inexistente e devolvia
  null, fazendo toda mensagem parecer a primeira.

Ao escrever integração ou tarefa agendada: **se o caminho de erro é silencioso,
faça-o gritar** — log de aviso, etiqueta na tela, o que for. E prefira uma
etiqueta visível de "falhou" a um estado que só existe no banco.

## Testes

`npm run test:bot` — o robô inteiro contra um banco falso (hoje ~670 + 60 + 35
verificações). `npm run simular` imprime conversas completas para alguém **ler**
e julgar o texto, porque teste que passa não garante que a mensagem faz sentido.

**Prove que o teste pega o defeito**: desligue a correção e confirme que ele
falha. Um teste que passa com o conserto desativado não testa nada — já
aconteceu aqui mais de uma vez.

## Comentários

O código explica **por que**, não o que. Quase todo comentário deste projeto
guarda um caso real: a data, o que quebrou, quem foi afetado. Escreva no mesmo
tom — quem ler daqui a um ano precisa entender a decisão sem arqueologia. Em
português, sem acento nos comentários de código (o arquivo circula por
ferramentas que estropiam).
