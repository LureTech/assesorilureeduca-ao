Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Load-McpEnv.ps1')

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw 'SUPABASE_ACCESS_TOKEN nao encontrado em .env.mcp.local'
}

if (-not $env:SUPABASE_PROJECT_REF) {
  throw 'SUPABASE_PROJECT_REF nao encontrado em .env.mcp.local'
}

$projectRef = $env:SUPABASE_PROJECT_REF

& npx -y "@supabase/mcp-server-supabase@latest" "--project-ref=$projectRef" --access-token $env:SUPABASE_ACCESS_TOKEN
