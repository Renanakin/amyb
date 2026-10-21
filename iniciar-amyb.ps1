$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    & node scripts/configure.mjs
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la configuracion' }
    & docker compose up --build -d
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el proyecto. Revisar docker compose logs' }
    Write-Host 'Amyb iniciado. Direccion y credenciales: revisar el archivo .env local.'
} finally { Pop-Location }
