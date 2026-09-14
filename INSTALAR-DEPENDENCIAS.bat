@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Instalar as dependencias do sistema
echo ============================================
echo.
echo As dependencias sao dezenas de milhares de arquivos
echo pequenos. Dentro do OneDrive isso vira fila de
echo sincronizacao e o computador engasga.
echo.
echo Por isso elas vao morar FORA do OneDrive, em
echo C:\dev\patricia-node_modules, e a pasta do projeto
echo recebe so um atalho apontando para la. Para o npm e
echo para o Vite nada muda.
echo.

if exist "node_modules\" (
  echo Ja existe uma pasta node_modules aqui.
  echo Apague ou renomeie antes de rodar este arquivo.
  echo.
  pause
  exit /b 1
)

if not exist "C:\dev\patricia-node_modules" mkdir "C:\dev\patricia-node_modules"
if errorlevel 1 goto erro

mklink /J "node_modules" "C:\dev\patricia-node_modules"
if errorlevel 1 goto erro

echo.
echo --- Instalando (leva alguns minutos) ---
call npm ci
if errorlevel 1 goto erro

echo.
echo ============================================
echo   Pronto.
echo.
echo   Agora o PUBLICAR.bat funciona: ele confere
echo   lint, build e testes antes de enviar.
echo   O ENVIAR.bat deixa de ser necessario.
echo ============================================
echo.
pause
exit /b 0

:erro
echo.
echo ============================================
echo   ALGO DEU ERRADO
echo.
echo   Copie a mensagem acima e mostre para o Claude.
echo ============================================
echo.
pause
exit /b 1
