# Documento de transicao - Central de Cuidado

Data: 23/08/2026  
Projeto local: `C:\Users\Edu\Desktop\dr marcelo\sistema-followup`  
Repositorio GitHub: `https://github.com/clinicamarcelloruiz/central-de-cuidado`  
Site publicado: `https://clinicamarcelloruiz.github.io/central-de-cuidado/`

Este documento resume o que foi feito, o que foi configurado na Meta, Supabase e GitHub, o erro atual e o que ainda falta finalizar.

Importante: nao colocar tokens, chaves secretas ou senhas neste arquivo. Alguns tokens apareceram em tela durante a configuracao, entao antes de producao o ideal e gerar novos tokens e salvar de novo no Supabase.

## 1. Objetivo do sistema

Sistema web responsivo para consultorio medico, com uso em desktop e mobile.

Fluxo principal:

1. O paciente passa em consulta.
2. A equipe cadastra o paciente e os dados da consulta.
3. O sistema cria acompanhamentos automaticos:
   - 30 dias apos a consulta.
   - 90 dias apos a consulta.
4. No dia certo, o sistema envia mensagem pelo WhatsApp Business API perguntando como o paciente esta.
5. A resposta do paciente deve ser recebida no sistema.
6. O medico/equipe acompanha indicadores e historico clinico.

Indicadores desejados:

- Quantidade de pacientes atendidos.
- Sexo.
- Idade.
- Cidade, bairro ou regiao do paciente.
- Unidade da clinica.
- Convenio.
- CID-10.
- Status dos acompanhamentos.
- Pacientes pendentes, enviados, concluidos e atrasados.

## 2. Estado atual do site

O site esta publicado em GitHub Pages:

`https://clinicamarcelloruiz.github.io/central-de-cuidado/`

A interface principal abre e mostra:

- Tela de login.
- Dashboard de acompanhamentos.
- Cadastro de paciente.
- Prontuario do paciente.
- Historico de consultas.
- Fila de acompanhamentos de 30 e 90 dias.
- Botao `Enviar agora` nos acompanhamentos.
- Botao `Concluir`.

O app da Meta tambem foi publicado com sucesso. A tela da Meta mostrou:

`Seu app foi publicado com sucesso. Seu app ja esta disponivel ao publico.`

## 3. Estado atual do WhatsApp e Meta

### App da Meta

Nome original usado durante testes:

`Central de Cuidado - Testes`

Nome de exibicao depois ajustado:

`Central de Cuidado`

App ID:

`2293240898131258`

### WhatsApp Business

Conta do WhatsApp Business:

`Clínica Dr. Marcelo`

WhatsApp Business Account ID:

`1095145476282142`

Numero registrado:

`+55 (13) 99681-1279`

Phone Number ID:

`1263379623523237`

### Webhook configurado na Meta

Callback URL:

`https://favohmryseurvnlxocfc.supabase.co/functions/v1/meta-webhook`

Campo principal assinado:

`messages`

Outros campos apareceram assinados automaticamente pela Meta, mas o essencial para conversa e resposta do paciente e o campo `messages`.

### Template aprovado

Template criado e aprovado:

Nome:

`acompanhamento_pos_consulta`

Categoria:

`Utilidade`

Idioma:

`Portuguese (BR)`

Status:

`Ativo - Qualidade pendente`

Corpo do template:

```text
Olá, {{1}}. A Clínica Dr. Marcello Ruiz está entrando em contato para acompanhar sua consulta realizada em {{2}}. Como você está? Responda esta mensagem caso precise falar com nossa equipe.
```

Rodape:

```text
Para não receber novos acompanhamentos, responda SAIR.
```

Amostras usadas:

```text
{{1}} = Ana
{{2}} = 20/08/2026
```

Botoes de resposta rapida:

```text
Estou bem
Preciso de ajuda
Não quero receber
```

Observacao: para chamada via API, o codigo de idioma provavelmente deve ser `pt_BR`.

## 4. Estado atual do Supabase

Organizacao:

`Clínica Dr. Marcelo`

Projeto:

`central-cuidado-dev`

Project ref:

`favohmryseurvnlxocfc`

Edge Functions esperadas:

- `meta-webhook`
- `whatsapp-send`

Arquivos locais relevantes:

- `supabase/functions/meta-webhook/index.ts`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/migrations/20260822120000_whatsapp_messaging.sql`

Secrets esperados no Supabase:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`

Possiveis outros secrets, dependendo do codigo:

- `META_GRAPH_VERSION`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_NAME`

Importante:

- Nao documentar os valores reais.
- Conferir se o token salvo no Supabase e o token permanente mais recente.
- Se o token foi exposto em print ou tela, gerar outro antes de usar com pacientes reais.

## 5. Problema atual principal

Ao clicar em `Enviar agora` no sistema publicado, apareceu o alerta:

```text
Acompanhamento não encontrado.
```

O botao do item clicado ficou em estado `Enviando...`.

Isso indica que a interface chamou a funcao de envio, mas a funcao nao conseguiu localizar o acompanhamento no banco.

Este e o problema mais importante a resolver agora.

## 6. Hipoteses provaveis do erro

O erro `Acompanhamento não encontrado` provavelmente nao e mais problema de Meta, token ou template, porque:

- O numero do WhatsApp foi registrado.
- O pagamento foi adicionado.
- O app foi publicado.
- O template foi aprovado.
- O webhook foi configurado.
- O token foi gerado e salvo.

As causas mais provaveis estao no sistema/Supabase:

1. O frontend esta criando acompanhamentos na tela a partir de pacientes, mas esses acompanhamentos nao existem como registros reais no banco.
2. O botao `Enviar agora` envia um ID gerado localmente, e a Edge Function procura esse ID em uma tabela do Supabase.
3. A tabela de acompanhamentos nao foi populada corretamente.
4. A migration do WhatsApp/acompanhamentos pode nao ter sido aplicada no Supabase.
5. A Edge Function `whatsapp-send` pode estar procurando em uma tabela ou coluna diferente da que o frontend usa.
6. O projeto Supabase usado pelo frontend pode nao ser o mesmo projeto onde as Edge Functions e tabelas estao configuradas.
7. O payload enviado pelo frontend para `whatsapp-send` pode estar com campo incorreto, por exemplo `followupId`, `trackingId`, `id`, `patientId` ou outro nome diferente do esperado.

## 7. O que verificar primeiro no codigo

Verificar estes arquivos:

1. `src/sections/Followups.tsx`
   - Onde o botao `Enviar agora` e renderizado.
   - Qual ID e passado para a funcao de envio.
   - Se os acompanhamentos vem do Supabase ou sao calculados localmente.

2. `supabase/functions/whatsapp-send/index.ts`
   - Qual campo ela espera no body.
   - Em qual tabela ela busca o acompanhamento.
   - Qual erro gera `Acompanhamento não encontrado`.
   - Se ela usa `service_role` corretamente.
   - Se ela chama o endpoint Graph com o template `acompanhamento_pos_consulta`.

3. `supabase/migrations/20260822120000_whatsapp_messaging.sql`
   - Quais tabelas existem para mensagens e follow-ups.
   - Se existe tabela para acompanhamentos.
   - Se existe campo de status.
   - Se existe relacionamento com paciente.

4. Arquivo de cliente Supabase no frontend
   - Conferir `SUPABASE_URL`.
   - Conferir `SUPABASE_ANON_KEY`.
   - Garantir que aponta para `favohmryseurvnlxocfc`.

## 8. Correcao provavel

A melhor correcao e fazer o sistema trabalhar com acompanhamentos persistidos no banco.

Fluxo recomendado:

1. Ao cadastrar paciente e consulta inicial, criar tambem dois registros de acompanhamento:
   - Tipo `30d`.
   - Tipo `90d`.
2. Cada acompanhamento precisa ter um ID real salvo no Supabase.
3. A tela deve listar acompanhamentos reais do banco, nao somente calculados localmente.
4. O botao `Enviar agora` deve enviar o ID real desse acompanhamento para a Edge Function.
5. A Edge Function deve:
   - Buscar o acompanhamento pelo ID.
   - Buscar o paciente relacionado.
   - Montar os parametros do template.
   - Enviar pela Cloud API.
   - Registrar o envio em tabela de mensagens.
   - Atualizar status do acompanhamento.
6. Se o envio falhar, a UI deve mostrar o erro completo ou uma mensagem clara, e tirar o botao do estado `Enviando...`.

## 9. Teste isolado da API do WhatsApp

Antes de culpar a interface, testar direto a API Graph.

Endpoint:

```text
POST https://graph.facebook.com/v26.0/1263379623523237/messages
```

Headers:

```text
Authorization: Bearer WHATSAPP_ACCESS_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "messaging_product": "whatsapp",
  "to": "5513991165576",
  "type": "template",
  "template": {
    "name": "acompanhamento_pos_consulta",
    "language": {
      "code": "pt_BR"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          {
            "type": "text",
            "text": "Eduardo"
          },
          {
            "type": "text",
            "text": "23/08/2026"
          }
        ]
      }
    ]
  }
}
```

Se isso funcionar:

- Meta esta OK.
- Template esta OK.
- Numero esta OK.
- Token esta OK.
- O erro esta no sistema ou no Supabase.

Se isso falhar:

- Copiar o JSON de erro completo da Meta.
- Verificar permissao `whatsapp_business_messaging`.
- Verificar token.
- Verificar Phone Number ID.
- Verificar nome do template.
- Verificar codigo do idioma.

## 10. O que ficou pendente no WhatsApp

Pendencias tecnicas:

- Confirmar que o token permanente salvo no Supabase e o ultimo gerado.
- Confirmar que a Edge Function `whatsapp-send` esta publicada/deployada no Supabase.
- Confirmar se a Edge Function consegue ler os secrets.
- Confirmar se a Edge Function usa o Phone Number ID correto:
  - `1263379623523237`
- Confirmar se o template usado no codigo e:
  - `acompanhamento_pos_consulta`
- Confirmar se o idioma no codigo e:
  - `pt_BR`
- Confirmar se o webhook `meta-webhook` esta recebendo respostas.
- Salvar logs de envio e resposta no banco.
- Resolver o erro `Acompanhamento não encontrado`.

## 11. Pendencias de produto e UX

### Cadastro e prontuario

O fluxo precisa ficar mais claro para uso real:

1. Botao `Novo paciente`.
2. Cadastro basico:
   - Nome do paciente.
   - Responsavel.
   - WhatsApp com DDD.
   - Data de nascimento.
   - Sexo.
   - Convenio.
   - Cidade e bairro do paciente.
   - Unidade onde foi atendido.
3. Consulta inicial:
   - Data da consulta.
   - Queixa principal.
   - Historia/evolucao.
   - Hipoteses/diagnostico.
   - CID-10.
   - Conduta/plano.
   - Orientacoes.
   - Observacao administrativa separada.
4. Ao salvar:
   - Criar paciente.
   - Criar consulta inicial.
   - Criar acompanhamento de 30 dias.
   - Criar acompanhamento de 90 dias.

### Edicao da consulta inicial

Problema relatado:

- Ao clicar em editar paciente, aparecem dados cadastrais, mas nao aparece a parte principal do prontuario.
- O usuario perguntou como editar a consulta inicial.

Necessario:

- No prontuario, cada consulta precisa ter botao `Editar consulta`.
- O card `Consulta inicial` precisa abrir os campos clinicos completos.
- O botao `Editar dados cadastrais` deve editar apenas cadastro, nao prontuario.

### Cidade e bairro

Esclarecimento de regra:

- `Unidade` = unidade/clinica onde o paciente foi atendido.
- `Cidade` e `Bairro/Regiao` = localizacao do paciente, para indicadores regionais.

Ideal ajustar labels para:

- `Cidade do paciente`
- `Bairro / região do paciente`
- `Unidade de atendimento`

### Editor de texto clinico

Foi pedido:

- Negrito.
- Italico.
- Sublinhado.
- Cores.
- Listas.
- Conversao de audio para texto.

Status:

- A interface chegou a mostrar barra de formatacao.
- O ditado/microfone apresentou problemas:
  - Em um PC nao pediu permissao.
  - Em outro PC pediu permissao, mas nao capturou audio corretamente.

Pendencias:

- Implementar fallback claro quando o navegador nao suportar SpeechRecognition.
- Mostrar botao `Permitir microfone`.
- Usar `navigator.mediaDevices.getUserMedia` para disparar permissao antes do ditado.
- Se o navegador nao suportar ditado, orientar usar Chrome atualizado.
- Opcional: integrar transcricao por API no futuro.

### Cadastro de usuarios e aprovacao admin

Foi pedido:

- Botao de cadastro na tela de login.
- Painel admin para aprovar usuarios.

Pendente implementar:

- Tela `Solicitar acesso`.
- Tabela de solicitacoes.
- Status `pendente`, `aprovado`, `recusado`.
- Admin consegue aprovar.
- Usuario aprovado consegue acessar.
- Usuario pendente ve aviso.

## 12. LGPD, privacidade e textos legais

Paginas criadas/publicadas:

- `https://clinicamarcelloruiz.github.io/central-de-cuidado/politica-de-privacidade.html`
- `https://clinicamarcelloruiz.github.io/central-de-cuidado/exclusao-de-dados.html`

Arquivos locais:

- `public/politica-de-privacidade.html`
- `public/exclusao-de-dados.html`

Alteracao pedida pelo usuario:

- Trocar email para:
  - `clinicamarcelloruiz@gmail.com`

Regra de escrita pedida:

- Nao usar travessao longo.
- Usar somente hifen simples `-`.

Revisar os arquivos para garantir:

- Email correto.
- Nenhum caractere de travessao longo.
- URLs corretas.
- Texto simples e profissional.

## 13. Cuidados com seguranca

Nunca commitar:

- Token da Meta.
- App Secret.
- Service role key do Supabase.
- Senha do banco.
- Chaves privadas.

Guardar no Supabase Secrets:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`

Como tokens apareceram em tela durante o processo, recomendacao:

1. Gerar novo token permanente no Meta Business.
2. Atualizar `WHATSAPP_ACCESS_TOKEN` no Supabase.
3. Redepoyar ou reiniciar Edge Function se necessario.
4. Nunca colocar token em arquivo do frontend.

## 14. Como testar depois da correcao

Teste minimo:

1. Criar paciente teste com numero de WhatsApp real autorizado.
2. Confirmar que foram criados dois acompanhamentos no banco:
   - 30 dias.
   - 90 dias.
3. Clicar `Enviar agora`.
4. Verificar se a mensagem chega no WhatsApp.
5. Responder pelo WhatsApp:
   - `Estou bem`
   - ou texto livre.
6. Verificar se a resposta aparece no sistema.
7. Verificar logs no Supabase.
8. Clicar `Concluir`.
9. Confirmar que o status mudou.

Se der erro:

- Mostrar erro detalhado na tela.
- Consultar logs da Edge Function.
- Consultar tabela de mensagens.
- Confirmar que o acompanhamento existe.

## 15. Tarefas recomendadas para o proximo desenvolvedor

Prioridade 1:

- Corrigir `Acompanhamento não encontrado`.
- Garantir que acompanhamentos sejam registros reais no banco.
- Ajustar botao `Enviar agora` para usar ID real do acompanhamento.
- Fazer a Edge Function enviar o template aprovado.

Prioridade 2:

- Melhorar logs e mensagens de erro.
- Exibir no sistema se o envio foi aceito pela Meta.
- Registrar `message_id` retornado pela Meta.
- Registrar status recebido via webhook.

Prioridade 3:

- Finalizar prontuario completo.
- Permitir editar consulta inicial.
- Permitir nova consulta.
- Separar observacao administrativa de dados clinicos.

Prioridade 4:

- Cadastro de usuario com aprovacao admin.
- Controle de permissoes.
- Melhorar experiencia mobile.

Prioridade 5:

- Revisar LGPD.
- Trocar email nos documentos.
- Remover qualquer travessao longo.
- Revisar textos finais.

## 16. Resumo do ponto de parada

O projeto esta com boa parte da estrutura visual e da configuracao externa pronta:

- GitHub Pages esta no ar.
- Supabase foi criado.
- Meta App foi publicado.
- WhatsApp Business API foi configurado.
- Numero novo foi registrado.
- Pagamento foi adicionado.
- Webhook foi configurado.
- Template de acompanhamento foi aprovado.

O ponto quebrado esta no envio pelo sistema:

```text
Acompanhamento não encontrado.
```

O proximo passo nao deve ser refazer Meta nem ficar clicando no console da Meta. O proximo passo deve ser corrigir a integracao entre frontend, banco Supabase e Edge Function `whatsapp-send`.

## 17. Observacao final

O usuario esta frustrado porque o processo demorou muito e consumiu creditos. O ideal e o proximo desenvolvedor ir direto ao ponto:

1. Abrir o codigo.
2. Encontrar onde `Acompanhamento não encontrado` e disparado.
3. Ver qual ID o frontend envia.
4. Ver se esse ID existe no Supabase.
5. Corrigir persistencia/listagem dos acompanhamentos.
6. Testar envio real com o template aprovado.

