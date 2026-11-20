# Sistema do consultorio - Dra. Patricia Zerbini

Sistema web responsivo para cadastro de pacientes e organização de acompanhamentos de 30 e 90 dias após a consulta.

## Publicação

O sistema é publicado automaticamente no GitHub Pages a cada atualização da branch `main`. O site é público apenas na tela de login; pacientes e dados clínicos permanecem no Supabase, protegidos por autenticação e RLS.

## Estado atual

- Interface desktop e mobile.
- Login por e-mail e senha com Supabase Auth.
- Pacientes, preferências e follow-ups armazenados no Supabase.
- RLS forçado em todas as tabelas clínicas; nenhuma tabela é acessível por `anon`.
- Pacientes são arquivados, sem exclusão direta pelo navegador.
- O botão de WhatsApp ainda abre uma mensagem pronta; o envio automático e a caixa de entrada serão ligados em uma etapa posterior pela API oficial.

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. Preencha apenas:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Nunca coloque senha do banco, secret key ou `service_role` no frontend.
4. Instale e execute:

```bash
npm install
npm run dev
```

## Banco de dados

As migrations ficam em `supabase/migrations/`. O primeiro usuário autenticado cria de forma atômica sua clínica, associação de proprietário e preferências iniciais.

## Verificação

```bash
npm run lint
npm run build
npm audit --omit=dev
```

## Primeiro acesso

Crie manualmente o primeiro usuário em **Supabase → Authentication → Users → Add user** e mantenha cadastro público desativado. Ao entrar pela primeira vez, o sistema cria o espaço da clínica e começa com a base vazia - nenhum paciente fictício é enviado para a nuvem.

## Coexistência: passo a passo do dia

Preparado em 19/11/2026. Coexistência é o mesmo número de WhatsApp funcionando no aplicativo WhatsApp Business do celular do consultório e na API (robô e Central) ao mesmo tempo.

O código já está publicável e fica **parado até o dia**: a Meta só manda os avisos novos (`history`, `smb_message_echoes`, `smb_app_state_sync`) para número ligado por coexistência, e a função `whatsapp-conectar` só age quando o responsável a chama. Publicar antes não muda nada no atendimento de hoje.

Quem faz cada passo: os passos na Meta, no celular e nos segredos são do Edu. Nenhum valor de segredo, token ou senha deve ser escrito neste arquivo, em commit ou em conversa.

### Antes do dia

- Publicar este código (`PUBLICAR.bat`). As migrations `20261119010000_coexistencia_do_numero.sql` e `20261119011000_servidor_grava_o_numero_da_clinica.sql` sobem junto. Conferir no GitHub Actions que o passo das migrations ficou verde.
- Escolher um horário calmo: depois que os lembretes da véspera do dia já saíram e com tempo para os modelos de mensagem serem aprovados antes dos lembretes do dia seguinte (ver o passo 9).
- Avisar a equipe de que o robô fica fora do ar entre os passos 2 e 8.

### 1. Backup manual do banco

O backup diário (`.github/workflows/backup-diario.yml`) roda sozinho às 03:30. No dia, rode um a mais, logo antes de começar:

- no GitHub: aba **Actions**, fluxo **Backup diario do banco**, botão **Run workflow**, branch `main`; ou
- no terminal: `gh workflow run backup-diario.yml --ref main`.

Espere a execução ficar verde e confira que o artefato cifrado (`backup-AAAA-MM-DD.tar.gz.gpg`) aparece nela. Se ficar vermelha, não siga. O backup cobre o banco; os arquivos do Storage (anexos do WhatsApp, PDFs) não entram nele.

Anote também, antes de mexer, o número e a conta de hoje (a `whatsapp-conectar` devolve os dois em `anterior`, ver o passo 8).

### 2. Tirar o número da API (Edu)

No Gerenciador do WhatsApp da conta onde o número está hoje, remover o número do robô da API. A partir daqui o robô, os lembretes e as respostas pela Central param, até o passo 8.

### 3. Registrar o número no WhatsApp Business do celular

Instalar ou abrir o aplicativo **WhatsApp Business** no celular do consultório e registrar o número (código por SMS ou ligação). Preencher o perfil (nome, foto, endereço do consultório no Gonzaga).

### 4. Cadastro da ECM com coexistência

Abrir o link de cadastro da ECM (Provedor de Tecnologia) com a opção de coexistência. O link é gerado no painel do app da ECM na Meta e não fica neste repositório. No fluxo, escolher **conectar o aplicativo WhatsApp Business existente**, informar o número e ler o QR code pelo celular (no app: Configurações, Conta, Plataforma comercial). Na tela do celular, aceitar compartilhar o histórico de conversas, se quiser as conversas do app dentro da Central.

**O relógio começa aqui: o pedido de contatos e histórico (passo 8) só é aceito pela Meta nas 24 horas seguintes ao QR code, e uma vez só.**

Ao terminar, anotar dois números da conta nova (aparecem no Gerenciador do WhatsApp da ECM): o id da conta do WhatsApp (WABA) e o id do número de telefone. Os dois mudam em relação aos de hoje.

### 5. Acesso do usuário do sistema "Robo Integracao"

No portfólio da ECM, em Configurações do negócio, Usuários do sistema, **Robo Integracao**: atribuir a conta nova do WhatsApp a ele, com controle total. O token dele precisa das permissões `whatsapp_business_messaging` e `whatsapp_business_management`. Sem este passo a Meta recusa tudo o que o robô tentar com a conta nova.

### 6. Segredos (o Edu digita os valores)

No Supabase do projeto `nvsxgvtwmcivdmrtpdqx`, em Edge Functions, Secrets. Só os nomes estão aqui:

| Segredo | Para quê | Obrigatório |
| --- | --- | --- |
| `META_APP_SECRET_ECM` | Chave secreta do app da ECM. O `meta-webhook` passa a aceitar também os avisos assinados por ele. | Sim |
| `WHATSAPP_WEBHOOK_PROPRIO` | Valor `sim`. Faz a `whatsapp-conectar` mandar a Meta entregar os avisos da conta nova no `meta-webhook` deste projeto. | Sim |
| `WHATSAPP_ACCESS_TOKEN_<id do número novo>` | Token do usuário do sistema "Robo Integracao". O nome leva o id do número anotado no passo 4, por exemplo `WHATSAPP_ACCESS_TOKEN_123456789012345` (id inventado). | Sim |
| `META_APP_ID_<id do número novo>` | Id do app da ECM. Só é usado para trocar a foto do perfil pela Central. | Não |
| `META_BUSINESS_ID` | Id do portfólio da ECM. Só é usado pela ação `listar` da `whatsapp-conectar`. | Não |

Segredos que já existem e **não devem ser apagados nem trocados**: `WHATSAPP_ACCESS_TOKEN` (a chave de hoje vira o plano B: é ela que o número antigo usa se for preciso desfazer, e o lembrete da véspera confere que ela existe antes de rodar), `META_APP_SECRET` (o Instagram e o gasto das campanhas dependem dele), `WHATSAPP_VERIFY_TOKEN` (a Meta confere o endereço novo do webhook com ele) e `META_APP_ID`.

Como o sistema escolhe a chave: para cada número ele procura `WHATSAPP_ACCESS_TOKEN_<id do número>` e, se não existir, usa `WHATSAPP_ACCESS_TOKEN`. Por isso criar o segredo do número novo não muda nada para o número de hoje. Um nome digitado errado cai calado na chave antiga: a `whatsapp-conectar` acusa isso no passo 8 (campo `chave`).

### 7. Publicar

Se o código ainda não foi publicado, rodar `PUBLICAR.bat` e esperar o Actions ficar verde (migrations primeiro, depois site e funções). Os segredos valem assim que são criados; não é preciso publicar de novo por causa deles.

### 8. Chamar a `whatsapp-conectar` (nas 24 horas do QR code)

Só a responsável pela clínica (papel `owner`) consegue. O token da sessão sai da Central aberta e logada: no navegador, Ferramentas do desenvolvedor, Application, Local Storage, chave `sb-nvsxgvtwmcivdmrtpdqx-auth-token`, campo `access_token`. Ele vale por cerca de uma hora.

```bash
curl -X POST "https://nvsxgvtwmcivdmrtpdqx.supabase.co/functions/v1/whatsapp-conectar" \
  -H "Authorization: Bearer <TOKEN_DA_SESSAO_DA_RESPONSAVEL>" \
  -H "apikey: <CHAVE_PUBLICA_DO_PROJETO>" \
  -H "Content-Type: application/json" \
  -d '{"acao":"conectar","waba_id":"<ID_DA_CONTA_NOVA>","phone_number_id":"<ID_DO_NUMERO_NOVO>","sincronizar":true}'
```

A função, nesta ordem: confere quem chama; confere que o banco deixa gravar; confere com a chave do robô que o número é da conta informada; assina os avisos da conta com desvio para o `meta-webhook` deste projeto; grava os dois ids em `clinic_settings`; pede à Meta os contatos e o histórico do celular.

O que olhar na resposta:

- `ok: true` e, em `passos`, "Número da conta", "Avisos da conta" e "Número gravado na clínica" com `ok: true`. "Contatos do celular" e "Histórico de conversas" podem falhar sem impedir o uso (prazo de 24 horas vencido, histórico não compartilhado).
- `chave: "do_numero"`. Se vier `"geral"`, o segredo do passo 6 não foi achado (nome errado).
- `webhookProprio: true`. Se vier `false`, falta o segredo `WHATSAPP_WEBHOOK_PROPRIO` e os avisos não chegam à Central.
- **`anterior`: guarde este trecho.** São o `waba_id` e o `phone_number_id` de antes, necessários para desfazer.

Erros que a função devolve com o motivo: `SO_RESPONSAVEL` (quem chamou não é a responsável), `BANCO_NAO_PRONTO` (falta a migration `20261119011000`), `NUMERO_NAO_CONFERE` (id errado, ou a chave não enxerga a conta: ver os passos 5 e 6), `SEM_DESVIO` (falta `WHATSAPP_VERIFY_TOKEN`), `META_RECUSOU` (o motivo da Meta vem junto). Em todos esses casos nada foi gravado.

A ação `listar` (`{"acao":"listar","phone_number_id":"<ID_DO_NUMERO_NOVO>"}`) mostra as contas compartilhadas com a ECM e os números de cada uma, se o segredo `META_BUSINESS_ID` existir. Serve para conferir os ids antes de conectar.

### 9. Recriar os modelos de mensagem na conta nova

Os modelos aprovados pertencem à conta do WhatsApp, e a conta é nova: sem eles, lembrete, acompanhamento e aviso são recusados pela Meta. Recriar no Gerenciador do WhatsApp da conta nova, com **o mesmo nome**, idioma Português (BR) e os textos de `MODELOS-META.md`:

1. `acompanhamento_pos_consulta`
2. `lembrete_consulta`
3. `resposta_da_clinica`
4. `consulta_cancelada`
5. `retomar_atendimento`
6. `aviso_pedido_consulta`
7. `aviso_pedido_consulta_simples`
8. `aviso_duvida_paciente`
9. `aviso_sistema_central`
10. `documento_do_consultorio`

Os cinco primeiros são os que falam com o paciente e a família (acompanhamento, lembrete da véspera, resposta fora das 24 horas, cancelamento, retomada). Do 6 ao 9 são os avisos no WhatsApp da Dra. Patrícia. O 10 é o envio de documento. Conferir em Preferências se os nomes configurados na clínica são estes mesmos. Enquanto um modelo não for aprovado, o envio que depende dele falha e aparece como falha no painel e na conversa.

### 10. Testar

De um celular que não seja da equipe:

- Mandar "oi" para o número: o robô responde o menu e a mensagem aparece na Central.
- Responder pela Central: chega no celular de teste.
- Responder **pelo aplicativo do celular do consultório**: a mensagem aparece na Central com a etiqueta "pelo celular", e o robô fica quieto naquela conversa (as 12 horas de sempre; o botão de devolver ao robô continua valendo).
- Mandar foto e áudio pelo celular de teste: aparecem na Central com o arquivo.
- Disparar um lembrete de teste (repetir confirmação numa consulta de teste) depois que `lembrete_consulta` for aprovado, e tocar em "Confirmar presença".
- Conferir o aviso no WhatsApp da Dra. Patrícia (Preferências, aviso de teste).
- Se o histórico foi compartilhado: conversas antigas do app aparecem na Central com a etiqueta "do celular", sem resposta do robô e sem pedido de atenção.
- Nos logs das funções (`meta-webhook` e `whatsapp-conectar`, no painel do Supabase), procurar linhas "Coexistencia:" e nenhuma "Invalid signature".
- No dia seguinte, conferir que os lembretes da véspera saíram.

### Como desfazer

O que a `whatsapp-conectar` desfaz é a parte do sistema: chamar de novo com os ids guardados de `anterior` e `sincronizar` desligado.

```bash
curl -X POST "https://nvsxgvtwmcivdmrtpdqx.supabase.co/functions/v1/whatsapp-conectar" \
  -H "Authorization: Bearer <TOKEN_DA_SESSAO_DA_RESPONSAVEL>" \
  -H "apikey: <CHAVE_PUBLICA_DO_PROJETO>" \
  -H "Content-Type: application/json" \
  -d '{"acao":"conectar","waba_id":"<WABA_ID_ANTERIOR>","phone_number_id":"<PHONE_NUMBER_ID_ANTERIOR>","sincronizar":false}'
```

Com isso o sistema volta a apontar para a conta e o número de antes, usando a chave de antes (`WHATSAPP_ACCESS_TOKEN`). Mas a função confere o número na Meta antes de gravar: ela só aceita voltar se o número já estiver de novo na API pela conta antiga, e esse caminho de volta na Meta (desligar a coexistência no celular e registrar o número outra vez na conta antiga) é manual e do Edu. Os modelos da conta antiga continuam aprovados lá.

O que não se desfaz: o histórico e as mensagens "pelo celular" que já entraram na Central ficam (são só registro), e o pedido de histórico à Meta não pode ser repetido.

Os segredos novos podem ficar: sem o número novo gravado na clínica, nenhum deles é usado.

