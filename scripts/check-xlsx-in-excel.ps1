#Requires -Version 5.1
<#
.SYNOPSIS
  Open an .xlsx in real Microsoft Excel and report what Excel makes of it.

.DESCRIPTION
  Confirms Excel itself accepts a workbook we generated, rather than silently
  repairing it. This is the one check the Node tests cannot make: the
  registered-student template's dropdowns and hidden list sheet are written as
  raw OOXML by src/lib/xlsxDropdowns.ts, and a wrong element order inside
  <worksheet> is exactly the fault that makes Excel show "we found a problem
  with some content". Every reader used in scripts/*-test.mjs parses such a
  file perfectly happily, so they cannot catch it.

  Run this after changing src/lib/xlsxDropdowns.ts or the template route, on a
  template downloaded from a running portal.

  Windows and Excel only, and deliberately not part of `npm test`: it drives
  Excel over COM, so it cannot run in CI or on the Linux build. The workbook is
  opened read-only and Excel is always closed again. An invisible EXCEL.EXE may
  linger for a few seconds afterwards and then exits on its own -- that is not a
  leak, and an Excel process with a window title is the user's own session, not
  this script's.

.PARAMETER Path
  The workbook to inspect.

.EXAMPLE
  npm run check:xlsx -- -Path C:\Users\me\Downloads\registered-students-template.xlsx

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\check-xlsx-in-excel.ps1 -Path template.xlsx
#>
param([Parameter(Mandatory = $true)][string]$Path)

$ErrorActionPreference = "Stop"
$xlValidateList     = 3
$xlValidAlertWarning = 2
$xlSheetVisible     = -1
$xlSheetVeryHidden  = 2

$abs = (Resolve-Path $Path).Path
Write-Output "file: $abs  ($((Get-Item $abs).Length) bytes)"

# Excel writes a repair log when it has to fix a file. Note what already
# exists so a new one can be told apart from an old one.
$logDirs = @(
  (Join-Path $env:APPDATA "Microsoft\Excel"),
  (Join-Path $env:TEMP "")
) | Where-Object { Test-Path $_ }
$before = @()
foreach ($d in $logDirs) {
  $before += Get-ChildItem -Path $d -Filter "error*.xml" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
}

$app = $null
$wb = $null
$pass = 0
$fail = 0
function Check($label, $ok, $detail = "") {
  if ($ok) { $script:pass++; Write-Output "PASS  $label" }
  else { $script:fail++; Write-Output "FAIL  $label  $detail" }
}

try {
  try { $app = New-Object -ComObject Excel.Application }
  catch {
    Write-Output "SKIP  Microsoft Excel is not available on this machine -- nothing was checked."
    Write-Output "      This script needs a real Excel install; the Node tests cover everything else."
    exit 2
  }
  $app.Visible = $false
  # Suppresses the repair prompt so this cannot hang on a dialog. A repair
  # would still be detected below, by its log and by what went missing.
  $app.DisplayAlerts = $false
  $app.AskToUpdateLinks = $false

  # ReadOnly, so nothing here can alter the file being judged.
  $wb = $app.Workbooks.Open($abs, $false, $true)
  Check "Excel opened the workbook" ($null -ne $wb)
  Write-Output "  Excel version: $($app.Version)   file format: $($wb.FileFormat)"

  # ---------------------------------------------------------------- sheets
  $names = @()
  foreach ($s in $wb.Worksheets) { $names += "$($s.Name)=$($s.Visible)" }
  Write-Output "  sheets: $($names -join ', ')"

  $students = $wb.Worksheets.Item(1)
  Check "the first sheet is the data sheet" ($students.Name -eq "Students") $students.Name
  Check "...and it is visible" ($students.Visible -eq $xlSheetVisible) "$($students.Visible)"

  $lists = $null
  try { $lists = $wb.Worksheets.Item("Lists") } catch { }
  Check "the Lists sheet is present" ($null -ne $lists)
  if ($lists) {
    Check "...and Excel reports it as veryHidden" ($lists.Visible -eq $xlSheetVeryHidden) "Visible=$($lists.Visible)"
  }

  # ------------------------------------------------------------ the header
  $used = $students.UsedRange
  Write-Output "  used range: $($used.Address($false,$false))  rows=$($used.Rows.Count) cols=$($used.Columns.Count)"
  $headerCells = @()
  for ($c = 1; $c -le $used.Columns.Count; $c++) { $headerCells += [string]$students.Cells.Item(1, $c).Text }
  Write-Output "  headers: $($headerCells -join ', ')"
  Check "the header row survived" ($headerCells[0] -eq "full_name") $headerCells[0]
  Check "the header is bold" ($students.Cells.Item(1, 1).Font.Bold -eq $true) "$($students.Cells.Item(1,1).Font.Bold)"
  Check "the example row is italic" ($students.Cells.Item(2, 1).Font.Italic -eq $true) "$($students.Cells.Item(2,1).Font.Italic)"
  Check "the example row reads back" ([string]$students.Cells.Item(2, 1).Text -eq "Jane Doe") ([string]$students.Cells.Item(2,1).Text)

  # --------------------------------------------------------- frozen header
  $students.Activate()
  Check "the header row is frozen" ($app.ActiveWindow.FreezePanes -eq $true -and $app.ActiveWindow.SplitRow -eq 1) `
    "FreezePanes=$($app.ActiveWindow.FreezePanes) SplitRow=$($app.ActiveWindow.SplitRow)"

  # ------------------------------------------------------- column widths
  $w = [math]::Round($students.Columns.Item(1).ColumnWidth, 1)
  Check "column A keeps its width" ($w -gt 20 -and $w -lt 28) "ColumnWidth=$w"

  # ------------------------------------------------------- the dropdowns
  # Discovered rather than assumed, so this script works for any of our
  # templates and reports what Excel actually found.
  $found = 0
  $firstDropdownColumn = $null
  for ($c = 1; $c -le $used.Columns.Count; $c++) {
    $cell = $students.Cells.Item(2, $c)
    $type = $null
    try { $type = $cell.Validation.Type } catch { $type = $null }
    if ($type -eq $xlValidateList) {
      $found++
      $v = $cell.Validation
      $letter = ($cell.Address($false, $false) -replace '\d', '')
      if (-not $firstDropdownColumn) { $firstDropdownColumn = $letter }
      Write-Output "  dropdown in column $letter : formula1='$($v.Formula1)' alert=$($v.AlertStyle) title='$($v.ErrorTitle)' msg='$($v.ErrorMessage)'"
      Check "  $letter is a list validation Excel accepts" ($v.Type -eq $xlValidateList)
      Check "  $letter uses the warning alert style" ($v.AlertStyle -eq $xlValidAlertWarning) "AlertStyle=$($v.AlertStyle)"
      Check "  $letter points at the Lists sheet" ($v.Formula1 -like "*Lists!*") $v.Formula1
      Check "  $letter carries its error title" ($v.ErrorTitle.Length -gt 0) $v.ErrorTitle
    }
  }
  Check "Excel found the dropdowns" ($found -ge 3) "$found found"

  # The validation must cover the whole declared range, and stop after it.
  $lastInRange = $null
  try { $lastInRange = $students.Range("$($firstDropdownColumn)301").Validation.Type } catch { $lastInRange = $null }
  Check "the far end of the validated range ($($firstDropdownColumn)301) still has it" ($lastInRange -eq $xlValidateList) "Type=$lastInRange"
  $pastRange = $null
  try { $pastRange = $students.Range("$($firstDropdownColumn)302").Validation.Type } catch { $pastRange = $null }
  Check "the row past the range ($($firstDropdownColumn)302) has none" ($pastRange -ne $xlValidateList) "Type=$pastRange"

  # ------------------------------------------- did Excel have to repair it?
  $after = @()
  foreach ($d in $logDirs) {
    $after += Get-ChildItem -Path $d -Filter "error*.xml" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
  }
  $new = $after | Where-Object { $before -notcontains $_ }
  Check "Excel wrote no repair log" ($new.Count -eq 0) ($new -join ", ")
}
finally {
  if ($wb) { $wb.Close($false) | Out-Null }
  if ($app) { $app.Quit() | Out-Null }
  foreach ($o in @($wb, $app)) {
    if ($o) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($o) } catch { } }
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Write-Output ""
  Write-Output "$pass passed, $fail failed"
  if ($fail -gt 0) { exit 1 }
}
