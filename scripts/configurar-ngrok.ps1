# Configura o token do ngrok sem que ele apareça na tela.
Write-Host ""
Write-Host "  Configurar ngrok para o Ghostflix" -ForegroundColor Magenta
Write-Host "  1. Abra https://dashboard.ngrok.com/get-started/your-authtoken (crie a conta se precisar)"
Write-Host "  2. Clique em 'Copy' ao lado do token"
Write-Host "  3. Cole aqui embaixo (clique com o botao direito ou Ctrl+V) e aperte Enter"
Write-Host ""
$secure = Read-Host "  Token" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if (-not $token) { Write-Host "  Nenhum token informado." -ForegroundColor Red; Read-Host "  Enter para sair"; exit 1 }
ngrok config add-authtoken $token
if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "  Pronto! ngrok configurado." -ForegroundColor Green
} else {
  Write-Host "  Nao deu certo. Confira se copiou o token inteiro." -ForegroundColor Red
}
Read-Host "  Enter para fechar"
