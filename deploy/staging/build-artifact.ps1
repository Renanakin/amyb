param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location -LiteralPath $projectRoot
try {
    if (git status --porcelain) { throw 'Crear el artefacto desde una revisión Git limpia.' }
    $commit = (git rev-parse HEAD).Trim()
    $release = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + $commit.Substring(0, 7)
    if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot '.artifacts' }
    $OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $stage = Join-Path $OutputDirectory $release
    New-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null
    npm ci
    if ($LASTEXITCODE) { throw 'Falló npm ci' }
    npm run build
    if ($LASTEXITCODE) { throw 'Falló la compilación' }
    foreach ($folder in @('frontend', 'backend', 'deploy')) {
        New-Item -ItemType Directory -Path (Join-Path $stage $folder) | Out-Null
    }
    foreach ($file in @('package.json', 'package-lock.json', '.nvmrc')) {
        Copy-Item -LiteralPath $file -Destination $stage
    }
    foreach ($file in @('backend/package.json', 'frontend/package.json')) {
        Copy-Item -LiteralPath $file -Destination (Join-Path $stage $file)
    }
    foreach ($folder in @('backend/dist', 'backend/dist-seed', 'backend/prisma', 'backend/deploy', 'frontend/dist', 'deploy/staging')) {
        Copy-Item -LiteralPath $folder -Destination (Join-Path $stage $folder) -Recurse
    }
    $utf8 = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText((Join-Path $stage 'RELEASE'), $release + "`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $stage 'COMMIT'), $commit + "`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $stage 'frontend/dist/robots.txt'), "User-agent: *`nDisallow: /`n", $utf8)
    $archive = Join-Path $OutputDirectory ($release + '.tar.gz')
    tar -czf $archive -C $stage .
    if ($LASTEXITCODE) { throw 'Falló la creación del archivo' }
    $entries = @(tar -tzf $archive)
    if ($LASTEXITCODE) { throw 'No se pudo revisar el archivo' }
    if ($entries | Where-Object { $_ -match '(^|/)(\.git|node_modules)(/|$)|(^|/)\.env($|[./])|(^|/)\.\./|^/' }) {
        throw 'El archivo contiene entradas excluidas'
    }
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($archive + '.sha256', $hash + '  ' + [IO.Path]::GetFileName($archive) + "`n", $utf8)
    Write-Output ('Release: ' + $release)
    Write-Output ('Artefacto: ' + $archive)
    Write-Output ('SHA256: ' + $hash)
} finally { Pop-Location }
