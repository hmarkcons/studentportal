# The PowerShell twin of seed-europe-scholarship-guides.mjs, for a machine that
# has no Node on it. Reads the same europe-scholarship-guides.json and does the
# same thing through Supabase's REST API: match each guide to a body by name,
# update it, or create it and link it to its countries.
#
# Written for Windows PowerShell 5.1, which is why it avoids && and ?? and
# reads the JSON as explicit UTF-8 — 5.1 reads a BOM-less file as ANSI and would
# turn every € and — in the guides into mojibake before they reached the table.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/apply-europe-scholarship-guides.ps1          # dry run
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/apply-europe-scholarship-guides.ps1 -Apply   # write
#
# Run from the repository root: it reads .env.local from the current directory.
# The service-role key is read into a variable and sent only as a header; it is
# never printed.

param([switch] $Apply)

$ErrorActionPreference = "Stop"

$envVars = @{}
Get-Content .env.local | Where-Object { $_ -match "=" } | ForEach-Object {
  $i = $_.IndexOf("=")
  $envVars[$_.Substring(0, $i)] = $_.Substring($i + 1).Trim().Trim('"')
}
$base = $envVars["NEXT_PUBLIC_SUPABASE_URL"]
$key = $envVars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $base -or -not $key) { throw "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local" }

# Supabase refuses a secret key from anything that looks like a browser, and
# PowerShell's default User-Agent starts with "Mozilla".
$ua = "hmark-portal-script/1.0"
$headers = @{ apikey = $key; Authorization = "Bearer $key" }
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Invoke-Rest($method, $path, $body, $prefer) {
  $h = $headers.Clone()
  if ($prefer) { $h["Prefer"] = $prefer }
  $req = @{ Method = $method; Uri = "$base/rest/v1/$path"; Headers = $h; UserAgent = $ua }
  if ($null -ne $body) {
    $req["ContentType"] = "application/json; charset=utf-8"
    # Bytes, not a string: a string body is re-encoded by the cmdlet and loses
    # the non-ASCII characters the guides are full of.
    $req["Body"] = $utf8.GetBytes((ConvertTo-Json -InputObject $body -Depth 12 -Compress))
  }
  return Invoke-RestMethod @req
}

$dataPath = Join-Path $PSScriptRoot "europe-scholarship-guides.json"
$guides = [IO.File]::ReadAllText($dataPath, $utf8) | ConvertFrom-Json

$columns = @("region", "covers", "academic_year", "application_deadline", "call_status", "call_expected_on", "call_notes",
  "source_url", "apply_url", "call_page_url", "call_pdf_url", "stipend_amount", "benefits")

$bodies = Invoke-Rest GET "scholarship_bodies?select=id,name,guide_sections" $null $null
$destinations = Invoke-Rest GET "destinations?select=id,country" $null $null

$byCountry = @{}
foreach ($d in $destinations) {
  $k = $d.country.Trim().ToLower()
  if (-not $byCountry.ContainsKey($k)) { $byCountry[$k] = @() }
  $byCountry[$k] += $d.id
}

function Patch-For($g) {
  $patch = [ordered]@{ guide_sections = $g.sections; guide_updated_at = (Get-Date).ToUniversalTime().ToString("o") }
  foreach ($c in $columns) {
    if ($g.PSObject.Properties.Name -contains $c) { $patch[$c] = $g.$c }
  }
  if ($patch["call_status"] -eq "published") { $patch["call_expected_on"] = $null }
  return $patch
}

$updated = 0
$created = 0
$problems = @()

foreach ($g in $guides) {
  $names = @($g.name) + @(if ($g.match) { $g.match } else { @() }) | ForEach-Object { $_.ToLower() }
  $body = $bodies | Where-Object { $names -contains $_.name.ToLower() } | Select-Object -First 1

  $destIds = @()
  foreach ($c in $g.countries) {
    $k = $c.Trim().ToLower()
    if ($byCountry.ContainsKey($k)) { $destIds += $byCountry[$k] }
  }
  $destIds = @($destIds | Select-Object -Unique)
  if ($destIds.Count -eq 0) {
    $problems += "$($g.name): none of [$($g.countries -join ', ')] is a destination - skipped"
    continue
  }

  $verb = if ($body) { "update" } else { "create" }
  $already = if ($body -and $body.guide_sections) { @($body.guide_sections).Count } else { 0 }
  $replacing = if ($already) { " (replacing $already)" } else { "" }
  $prefix = if ($Apply) { $verb.PadRight(7) } else { "would $verb".PadRight(13) }
  "{0} {1,-64} {2} sections{3}  -> {4}" -f $prefix, $g.name, @($g.sections).Count, $replacing, ($g.countries -join ", ")
  if (-not $Apply) { continue }

  try {
    if ($body) {
      # Matched through an alias: the data file is renaming the body.
      $patch = Patch-For $g
      if ($body.name.ToLower() -ne $g.name.ToLower()) { $patch["name"] = $g.name }
      Invoke-Rest PATCH "scholarship_bodies?id=eq.$($body.id)" $patch "return=minimal" | Out-Null
      $links = @($destIds | ForEach-Object { @{ scholarship_body_id = $body.id; destination_id = $_ } })
      Invoke-Rest POST "scholarship_body_destinations?on_conflict=scholarship_body_id,destination_id" $links "resolution=ignore-duplicates,return=minimal" | Out-Null
      $updated++
    } else {
      $insert = Patch-For $g
      $insert.Insert(0, "name", $g.name)
      $insert["last_updated_year"] = (Get-Date).Year
      $row = Invoke-Rest POST "scholarship_bodies?select=id" $insert "return=representation"
      $newId = @($row)[0].id
      try {
        $links = @($destIds | ForEach-Object { @{ scholarship_body_id = $newId; destination_id = $_ } })
        Invoke-Rest POST "scholarship_body_destinations" $links "return=minimal" | Out-Null
      } catch {
        Invoke-Rest DELETE "scholarship_bodies?id=eq.$newId" $null $null | Out-Null
        throw
      }
      $created++
    }
  } catch {
    $problems += "$($g.name): $($_.Exception.Message)"
  }
}

""
"$(@($guides).Count) guides in the file."
if ($Apply) { "$updated updated, $created created." }
if ($problems.Count) {
  ""
  "Problems:"
  $problems | ForEach-Object { "  $_" }
  exit 1
}
if (-not $Apply) { ""; "Dry run. Re-run with -Apply to write." }
