# Runs win-helper inside Windows PowerShell 5.1 by compiling the shared C# sources with Add-Type.
# powershell.exe is signed by Microsoft, so this works where Smart App Control blocks the unsigned
# win-helper.exe. Speaks the same JSON-lines protocol on stdin/stdout.
param(
    # Exit when this process (the MCP server) dies, even if stdin is never closed.
    [int]$ParentPid = 0
)
$ErrorActionPreference = 'Stop'

$sources = Get-ChildItem -Path (Join-Path $PSScriptRoot 'src') -Filter '*.cs' |
    Where-Object { $_.Name -ne 'Program.cs' } |
    ForEach-Object { $_.FullName }

try {
    Add-Type -Path $sources
} catch {
    [Console]::Error.WriteLine("win-helper: could not compile the helper: $($_.Exception.Message)")
    exit 2
}

[WinHelper.Host]::RunStdio($ParentPid)
