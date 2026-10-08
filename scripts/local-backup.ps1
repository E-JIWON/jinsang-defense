# 내 PC를 예비 AI로 켜는 스크립트 (docs/local-llm.md)
#   1) Ollama 서버가 안 떠 있으면 띄우고
#   2) Cloudflare 빠른 터널을 열어 공개 주소를 받고
#   3) 그 주소를 게임(Cloudflare Workers)의 secret LLM_BACKUP_BASE_URL에 넣는다
# 창을 닫으면 터널이 끊기니 PC를 쓰는 동안 그대로 둔다. 다시 켜면 주소가 바뀌는데, 이 스크립트가 secret도 다시 넣는다.
#
# 처음 한 번:  npx.cmd wrangler login   (브라우저에서 허용)
# 실행:        powershell -ExecutionPolicy Bypass -File scripts\local-backup.ps1
# 부팅 때 자동: 시작프로그램 폴더(shell:startup)에 이 파일의 바로 가기를 둔다. 아래 -InstallStartup 으로 만들 수 있다.
#   powershell -ExecutionPolicy Bypass -File scripts\local-backup.ps1 -InstallStartup

param(
  [switch]$InstallStartup,
  [string]$Model = "qwen3.5:9b"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflared)) { $cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }
$log = Join-Path $env:TEMP "cloudflared-tunnel.log"

if ($InstallStartup) {
  $startup = [Environment]::GetFolderPath("Startup")
  $lnk = Join-Path $startup "jinsang-backup-ai.lnk"
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut($lnk)
  $s.TargetPath = "powershell.exe"
  $s.Arguments = "-ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
  $s.WorkingDirectory = $root
  $s.Description = "Ollama + Cloudflare 터널 + secret 갱신"
  $s.Save()
  Write-Host "시작프로그램에 등록했어요: $lnk"
  Write-Host "지우려면 그 파일을 삭제하면 돼요."
  exit 0
}

$host.UI.RawUI.WindowTitle = "진상손님 예비 AI (닫지 마세요)"
Set-Location $root

function Test-Ollama {
  try { (Invoke-WebRequest -UseBasicParsing http://localhost:11434 -TimeoutSec 3).StatusCode -eq 200 } catch { $false }
}

# 1) Ollama
if (-not (Test-Ollama)) {
  if (-not (Test-Path $ollama)) { throw "Ollama가 없어요. https://ollama.com/download 에서 설치하세요." }
  Write-Host "Ollama 서버를 켭니다..."
  # 트레이 앱이 있으면 그것을, 없으면 serve를 숨김 창으로
  $app = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"
  if (Test-Path $app) { Start-Process $app } else { Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden }
  $i = 0
  while (-not (Test-Ollama) -and $i -lt 20) { Start-Sleep 1; $i++ }
  if (-not (Test-Ollama)) {
    Write-Host "트레이 앱이 안 떠서 serve로 띄웁니다"
    Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden
    $i = 0
    while (-not (Test-Ollama) -and $i -lt 20) { Start-Sleep 1; $i++ }
  }
}
if (-not (Test-Ollama)) { throw "Ollama가 응답하지 않아요 (http://localhost:11434)" }
Write-Host "Ollama OK"

# 모델을 미리 올려 둔다(첫 손님이 15초 기다리지 않게)
try {
  $null = Invoke-RestMethod -Uri http://localhost:11434/api/generate -Method Post -ContentType "application/json" `
    -Body (@{ model = $Model; prompt = "hi"; stream = $false; think = $false; keep_alive = -1 } | ConvertTo-Json) -TimeoutSec 120
  Write-Host "모델 $Model 올림 (GPU 확인: ollama ps)"
} catch { Write-Host "모델을 미리 올리지 못했어요: $($_.Exception.Message) (ollama pull $Model 했는지 확인)" }

# 2) 터널
if (-not $cloudflared) { throw "cloudflared가 없어요. winget install --id Cloudflare.cloudflared" }
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $log -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath $cloudflared -PassThru -WindowStyle Hidden `
  -ArgumentList "tunnel", "--url", "http://localhost:11434", "--http-host-header", "localhost:11434", "--logfile", $log
$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
  Start-Sleep 1
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -First 1
    if ($m) { $url = $m }
  }
}
if (-not $url) { throw "터널 주소를 못 받았어요. 로그: $log" }
Write-Host "터널: $url"

# 터널로 모델 목록이 보이는지
try {
  $ids = (Invoke-RestMethod -Uri "$url/v1/models" -TimeoutSec 30).data.id
  Write-Host "터널 경유 모델: $($ids -join ', ')"
} catch { Write-Host "터널 경유 확인 실패: $($_.Exception.Message)" }

# 3) secret
Write-Host "게임 secret(LLM_BACKUP_BASE_URL)에 넣는 중..."
"$url/v1" | & npx.cmd wrangler secret put LLM_BACKUP_BASE_URL
if ($LASTEXITCODE -ne 0) {
  Write-Host "secret 등록 실패. 처음이면 npx.cmd wrangler login 을 먼저 하세요. 직접 넣으려면:"
  Write-Host "  `"$url/v1`" | npx.cmd wrangler secret put LLM_BACKUP_BASE_URL"
} else {
  Write-Host "완료. 게임이 Gemini에 막히면 이 PC가 대신 답해요."
}

Write-Host ""
Write-Host "이 창을 닫으면 터널이 끊겨요. Ctrl+C 또는 창 닫기로 끝냅니다."
try { Wait-Process -Id $tunnel.Id } finally { Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force }
