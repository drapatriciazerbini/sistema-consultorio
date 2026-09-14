@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Instalar as dependencias do sistema
echo ============================================
echo.
echo O projeto vive fora do OneDrive, entao a instalacao
echo e a normal: nada de atalho, nada de sincronizacao.
echo.

if exist "node_modules\" (
  echo Apagando a instalacao antiga, que ficou pela metade...
  rmdir /s /q "node_modules"
)

echo --- Instalando (leva alguns minutos) ---
call npm ci
if errorlevel 1 goto erro

echo.
echo ============================================
echo   Pronto. Agora use o PUBLICAR.bat: ele
echo   confere lint, build e testes antes de enviar.
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
