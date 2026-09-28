# merge-auth-files.ps1
# Run from the root directory (contains backend/ and frontend/)

$files = @(
    # Backend
    "backend\src\server.ts",
    "backend\src\middleware\auth.ts",
    "backend\src\middleware\tailscale.ts",
    "backend\src\middleware\rate-limit.ts",
    "backend\src\middleware\system-load.ts",
    "backend\src\middleware\delete-code.ts",
    "backend\src\routes\admin\auth.ts",
    "backend\src\services\auth-service.ts",
    "backend\src\services\token-service.ts",
    "backend\src\lib\security\device-fingerprint.ts",
    "backend\src\lib\security\csrf.ts",
    "backend\src\lib\auth-cookies.ts",
    "backend\src\lib\validators\auth.ts",
    "backend\src\lib\redis.js",
    "backend\src\lib\supabase.js",
    "backend\src\lib\audit.ts",
    "backend\src\services\notification-service.ts",
    # Frontend
    "frontend\components\providers\SessionProvider.tsx",
    "frontend\lib\api\client.ts",
    "frontend\lib\api\types.ts",
    "frontend\lib\api\hooks.ts",
    "frontend\app\[locale]\(auth)\login\LoginPageClient.tsx",
    "frontend\app\[locale]\(auth)\verify-2fa\Verify2FAPageClient.tsx",
    "frontend\app\[locale]\(auth)\layout.tsx",
    "frontend\app\admin\layout.tsx",
    "frontend\app\[locale]\layout.tsx",
    "frontend\components\providers\TailscaleGateProvider.tsx",
    "frontend\components\admin\TailscaleStatus.tsx",
    "frontend\lib\hooks\useGeoLocation.ts",
    "frontend\lib\api\rate-limit-cache.ts",
    # Optional: session listing/revocation route (adjust path if needed)
    "backend\src\routes\admin\monitor.ts"
)

$output = "merged.txt"
Set-Content -Path $output -Value ""

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        Add-Content -Path $output -Value "`r`n========================================`r`n"
        Add-Content -Path $output -Value "FILE: $file`r`n"
        Add-Content -Path $output -Value "========================================`r`n"
        Add-Content -Path $output -Value $content
    } else {
        Add-Content -Path $output -Value "`r`n========================================`r`n"
        Add-Content -Path $output -Value "FILE: $file (NOT FOUND)`r`n"
        Add-Content -Path $output -Value "========================================`r`n"
    }
}

Write-Host "Merged all files into $output"