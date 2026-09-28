# raw-errors-v3.ps1
$ErrorActionPreference = "Continue"
$root = Get-Location
Write-Host "Scanning for raw error messages shown to users..." -ForegroundColor Cyan

$scanDirs   = @("components", "app")
$extensions = @("*.tsx", "*.ts")
$allFiles = foreach ($dir in $scanDirs) {
    $full = Join-Path $root $dir
    if (Test-Path $full) {
        Get-ChildItem -Path $full -Recurse -Include $extensions | Where-Object { !$_.PSIsContainer -and $_.FullName -notmatch "\\node_modules\\" }
    }
}

$results = @()
foreach ($file in $allFiles) {
    $lines = [System.IO.File]::ReadAllLines($file.FullName, [System.Text.Encoding]::UTF8)
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match "(toast\.error|setError)\(\s*err(?:\\?.message)?") {
            if ($line -match '^\s*//') { continue }
            $results += [PSCustomObject]@{
                File = $file.FullName.Replace($root.Path, '.').Replace('\', '/')
                Line = $i + 1
                Code = $line.Trim()
            }
        }
    }
}

if ($results.Count -gt 0) {
    Write-Host "`nPotential raw backend messages:" -ForegroundColor Yellow
    $results | Format-Table File, Line, Code -AutoSize -Wrap
} else {
    Write-Host "`nNo raw backend messages found." -ForegroundColor Green
}