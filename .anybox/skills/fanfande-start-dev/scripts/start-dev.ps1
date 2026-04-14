$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..\\..")).Path
$serverDir = Join-Path $repoRoot "packages\\fanfandeagent"
$desktopDir = Join-Path $repoRoot "packages\\desktop"

function Assert-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Label directory not found: $Path"
    }
}

function Start-DevWindow {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $startupCommand = "& { `$Host.UI.RawUI.WindowTitle = '$Title'; $Command }"

    Start-Process -FilePath "powershell.exe" `
        -WorkingDirectory $WorkingDirectory `
        -ArgumentList @(
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            $startupCommand
        ) | Out-Null
}

Assert-Directory -Path $serverDir -Label "Server"
Assert-Directory -Path $desktopDir -Label "Desktop"

Start-DevWindow -Title "Fanfande Server" -WorkingDirectory $serverDir -Command "bun run dev:server"
Start-DevWindow -Title "Fanfande Desktop" -WorkingDirectory $desktopDir -Command '$env:FANFANDE_DISABLE_MANAGED_AGENT = "1"; $env:FANFANDE_AGENT_BASE_URL = "http://127.0.0.1:4096"; bun run dev'

Write-Host "Started server in $serverDir"
Write-Host "Started desktop client in $desktopDir"
