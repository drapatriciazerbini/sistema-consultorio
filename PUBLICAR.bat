@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Publicar o sistema da Dra. Patricia
echo ============================================
echo.

rem Remove a trava que sobra quando algum processo de git foi interrompido.
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1

rem Confere o projeto ANTES de enviar, com os mesmos comandos que o GitHub usa.
rem Em 30/08/2026 um erro de tipagem passou daqui e a publicacao falhou la, sem
rem ninguem perceber: o site continuou com a versao antiga por horas.
echo --- Conferindo o projeto (leva cerca de dois minutos) ---
call npm run lint
if errorlevel 1 goto erro_conferencia
call npm run build
if errorlevel 1 goto erro_conferencia
call npm run test:bot
if errorlevel 1 goto erro_conferencia
echo.
echo Conferencia OK.
echo.

rem Fixa a conta do GitHub na URL do repositorio. Sem isso, com mais de uma
rem conta salva no Windows, o git abre uma janela perguntando qual usar - e no
rem agendador de tarefas nao ha ninguem para clicar nela.
git remote set-url origin https://drapatriciazerbini@github.com/drapatriciazerbini/sistema-consultorio.git
git config credential.username drapatriciazerbini

rem A mensagem do commit leva data e hora, entao nao precisa digitar nada.
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format \"dd/MM/yyyy HH:mm\""') do set "AGORA=%%i"
set "MSG=Atualizacao do sistema %AGORA%"

rem Em 06/09/2026 a lista abaixo nao tinha o vite.config.ts. A tela usava uma
rem variavel definida la, o GitHub montou sem ela, e o sistema abriu em branco -
rem sem erro nenhum na conferencia, porque na maquina o arquivo existia.
rem
rem O "git add -u" e o conserto: ele envia TODA alteracao em arquivo que ja faz
rem parte do projeto, sem depender de alguem lembrar de citar o nome. A lista
rem depois dele so serve para arquivo novo, que ninguem conhece ainda. E o que
rem nao esta em nenhum dos dois - rascunho, teste, pasta tmp - fica de fora de
rem proposito: o repositorio e publico.
echo --- Preparando arquivos ---
git add -u
if errorlevel 1 goto erro
git add src supabase .github public index.html package.json vite.config.ts
if errorlevel 1 goto erro

echo.
echo --- Registrando a alteracao ---
git commit -m "%MSG%"
if not errorlevel 1 goto enviar

rem "Nada para registrar" nao quer dizer "nada para enviar".
rem
rem Em 14/09/2026 este arquivo parou aqui com tres commits prontos e nenhum
rem deles no GitHub: eles tinham sido registrados antes, fora deste arquivo. A
rem janela dizia "tudo ja estava enviado" e nao estava. Agora, quando nao ha o
rem que registrar, ele pergunta ao GitHub quantos commits faltam la.
echo.
echo Nada novo para registrar. Conferindo se ha commit pendente...
git fetch origin main
if errorlevel 1 goto erro
for /f %%i in ('git rev-list --count origin/main..HEAD') do set "PENDENTES=%%i"

if "%PENDENTES%"=="0" (
  echo.
  echo Nada novo para publicar. Tudo ja estava enviado.
  echo.
  echo Esta janela fecha em 10 segundos.
  timeout /t 10 >nul
  exit /b 0
)

echo Existem %PENDENTES% commit(s) registrados e ainda nao enviados.

:enviar

echo.
echo --- Enviando para o GitHub ---
git push origin HEAD:main
if errorlevel 1 goto erro

rem Guarda o codigo desta publicacao para conferir depois.
rem "Publiquei" e "esta no ar" sao duas coisas diferentes: o GitHub leva alguns
rem minutos para servir o build novo e o navegador ainda guarda o antigo. Sem um
rem codigo para comparar, so restava adivinhar olhando a tela.
for /f %%i in ('git rev-parse --short=7 HEAD') do set "VERSAO=%%i"

echo.
echo ============================================
echo   Pronto!
echo.
echo   VERSAO PUBLICADA:  %VERSAO%
echo.
echo   Em alguns minutos, o rodape do menu lateral
echo   do sistema tem que mostrar esse mesmo codigo.
echo   Se mostrar outro, a pagina ainda esta velha:
echo   atualize com Ctrl+F5.
echo.
echo   Acompanhe a publicacao em:
echo   github.com/drapatriciazerbini/sistema-consultorio/actions
echo ============================================
echo.
echo Esta janela fecha em 30 segundos.
timeout /t 30 >nul
exit /b 0

:erro_conferencia
echo.
echo ============================================
echo   NAO PUBLIQUEI - O PROJETO TEM UM ERRO
echo.
echo   Nada foi enviado, entao o sistema no ar
echo   continua funcionando como esta.
echo.
echo   Copie a mensagem de erro acima e mostre
echo   para o Claude.
echo ============================================
echo.
pause
exit /b 1

:erro
echo.
echo ============================================
echo   ALGO DEU ERRADO
echo.
echo   Copie a mensagem acima e mostre para o Claude.
echo   Esta janela NAO fecha sozinha, para voce
echo   conseguir ler o erro.
echo ============================================
echo.
pause
exit /b 1
