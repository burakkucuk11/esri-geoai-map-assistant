$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$pgBin = $env:POSTGIS_PG_BIN
if (-not $pgBin) {
  $pgBin = "C:\Program Files\PostgreSQL\18\bin"
}

$dataDir = Join-Path $root "server\storage\postgres-data"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"

if (-not (Test-Path $pgCtl)) {
  throw "pg_ctl.exe bulunamadi: $pgCtl"
}

if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  throw "PostgreSQL data klasoru hazir degil: $dataDir"
}

& $pgCtl stop -D $dataDir -m fast -w
