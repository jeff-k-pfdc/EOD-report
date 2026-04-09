# Creates a desktop shortcut to EOD Summary.exe
# Run this once after building: npm run electron-package
# Then right-click the desktop shortcut and choose "Pin to taskbar"

$exePath      = Join-Path $PSScriptRoot "release\win-unpacked\EOD Summary.exe"
$shortcutPath = [Environment]::GetFolderPath("Desktop") + "\EOD Summary.lnk"

if (-not (Test-Path $exePath)) {
    Write-Host "ERROR: Executable not found at: $exePath" -ForegroundColor Red
    Write-Host "Run 'npm run electron-package' first to build the app." -ForegroundColor Yellow
    exit 1
}

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath       = $exePath
$shortcut.WorkingDirectory = Split-Path $exePath
$shortcut.Description      = "EOD Summary"
$shortcut.Save()

Write-Host "Shortcut created on your Desktop: $shortcutPath" -ForegroundColor Green
Write-Host ""
Write-Host "To pin to taskbar:" -ForegroundColor Cyan
Write-Host "  1. Find 'EOD Summary' on your Desktop"
Write-Host "  2. Right-click it -> 'Pin to taskbar'"
