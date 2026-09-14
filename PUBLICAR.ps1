# Publicar o sistema da Dra. Patricia - site + Edge Functions
# Rode bloco por bloco no PowerShell. Nao rode tudo de uma vez na primeira vez.

cd "C:\Users\Edu\Desktop\dr marcelo\sistema-followup"


# ---------------------------------------------------------------
# BLOCO 1 - conferir antes de mexer em nada (nao altera nada)
# ---------------------------------------------------------------

# Qual identidade sera usada no commit (deve ser a da clinica)
git config user.name
git config user.email

# Existe credencial do GitHub salva no Windows?
# Se aparecer uma entrada, o push nao vai pedir login e nada muda.
cmdkey /list | Select-String "github"

# Voce ja esta logado na CLI do Supabase?
# Se listar projetos, PULE o "supabase login" no bloco 3.
npx supabase projects list


# ---------------------------------------------------------------
# BLOCO 2 - commit e publicacao do site
# ---------------------------------------------------------------

# Remove um lock deixado por uma tentativa anterior
Remove-Item .git\index.lock -ErrorAction SilentlyContinue

# Adiciona apenas os dois arquivos alterados agora.
# O .gitignore tem uma alteracao antiga nao relacionada e fica de fora.
git add src/sections/Followups.tsx supabase/functions/whatsapp-send/index.ts

git commit -m "Detalhar erros do envio pelo WhatsApp"

# Sua branch atual e codex/integrar-envio-whatsapp e o main local esta
# desatualizado. Isto publica em main sem precisar trocar de branch.
git push origin HEAD:main


# ---------------------------------------------------------------
# BLOCO 3 - publicar as Edge Functions
# ---------------------------------------------------------------

# SO rode esta linha se o BLOCO 1 deu erro de autenticacao.
# Atencao: este login e global e substitui a sessao da CLI de outra conta.
# npx supabase login

npx supabase functions deploy whatsapp-send --project-ref nvsxgvtwmcivdmrtpdqx
npx supabase functions deploy meta-webhook --project-ref nvsxgvtwmcivdmrtpdqx


# ---------------------------------------------------------------
# BLOCO 4 - voltar a CLI para a outra conta, se precisar
# ---------------------------------------------------------------

# npx supabase logout
# npx supabase login
