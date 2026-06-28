$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$pgBin = $env:POSTGIS_PG_BIN
if (-not $pgBin) {
  $pgBin = "C:\Program Files\PostgreSQL\18\bin"
}

$dataDir = Join-Path $root "server\storage\postgres-data"
$bundleDir = Join-Path $root "server\storage\postgis-pg18\postgis-bundle-pg18-3.6.2x64"
$logFile = Join-Path $root "server\storage\postgres.log"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"
$pgReady = Join-Path $pgBin "pg_isready.exe"

if (-not (Test-Path $pgCtl)) {
  throw "pg_ctl.exe bulunamadi: $pgCtl"
}

if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  throw "PostgreSQL data klasoru hazir degil: $dataDir"
}

if (-not (Test-Path $bundleDir)) {
  throw "PostGIS bundle klasoru bulunamadi: $bundleDir"
}

$env:PATH = "$bundleDir\bin;$bundleDir\lib;$pgBin;$env:PATH"

& $pgCtl status -D $dataDir *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgCtl start -D $dataDir -l $logFile -w
}

& $pgReady -h localhost -p 5432
