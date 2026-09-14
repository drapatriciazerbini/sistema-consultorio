@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Enviar o sistema da Dra. Patricia
echo ============================================
echo.
echo As conferencias (lint, build e testes) ja foram
echo feitas antes do commit. Este arquivo so envia.
echo.

rem Tira a trava que sobra quando um git anterior foi interrompido.
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1

rem Fixa a conta certa: ha mais de uma conta GitHub salva neste computador.
git config credential.username drapatriciazerbini

echo --- Enviando para o GitHub ---
git push origin main
if errorlevel 1 goto erro

echo.
echo ============================================
echo   Enviado.
echo.
echo   Acompanhe a publicacao em:
echo   github.com/drapatriciazerbini/sistema-consultorio/actions
echo ============================================
echo.
pause
exit /b 0

:erro
echo.
echo ============================================
echo   NAO ENVIOU
echo.
echo   Copie a mensagem acima e mostre para o Claude.
echo ============================================
echo.
pause
exit /b 1
