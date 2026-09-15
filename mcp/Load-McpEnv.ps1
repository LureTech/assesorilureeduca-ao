Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env.mcp.local'

if (-not (Test-Path $envFile)) {
  return
}

foreach ($line in Get-Content $envFile) {
  if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
    continue
  }

  $parts = $line -split '=', 2
  if ($parts.Count -ne 2) {
    continue
  }

  $name = $parts[0].Trim()
  $value = $parts[1].Trim()

  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
