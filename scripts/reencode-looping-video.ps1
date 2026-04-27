# Re-encode Images/looping_video2.mp4 to H.264 (yuv420p) so Edge, Chrome, Safari, and Windows can play it.
# Install FFmpeg first, e.g.: winget install --id Gyan.FFmpeg
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root "Images\looping_video2.mp4"
$dst = Join-Path $root "public\looping_video2.mp4"

if (-not (Test-Path -LiteralPath $src)) {
  Write-Error "Missing source file: $src"
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "ffmpeg not found. Install with: winget install --id Gyan.FFmpeg" -ForegroundColor Yellow
  exit 1
}

# -an: no audio track (loader is silent). Remove -an if you need sound.
# -movflags +faststart: web-friendly progressive download
ffmpeg -y -i $src -c:v libx264 -profile:v high -pix_fmt yuv420p -movflags +faststart -an $dst

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "OK: $dst" -ForegroundColor Green
Write-Host "Optional: copy the same file to Images\looping_video2.mp4 if you want one canonical H.264 source."
