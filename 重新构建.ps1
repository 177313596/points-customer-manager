# 积分客户管理系统 · 重新构建脚本
# 用法（在项目根目录）：
#   .\重新构建.ps1            # 改完界面/主进程后，构建并同步到成品（最常用）
#   .\重新构建.ps1 -Dev       # 界面热更新调试：起 Vite 服务 + 打开 Electron 窗口
#   .\重新构建.ps1 -Full      # 加了新依赖后：重新 npm install 再构建
#   .\重新构建.ps1 -SkipBuild # 不构建，只把现有 dist/electron 同步到成品

param(
  [switch]$Dev,
  [switch]$Full,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$app    = Join-Path $root 'app'
$out    = Join-Path $root '积分客户管理系统'
$resApp = Join-Path $out 'resources\app'

function Info($m) { Write-Host "[..] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK] $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[!!] $m" -ForegroundColor Red; exit 1 }

# ---------- 0. 环境检查 ----------
if (-not (Test-Path -LiteralPath (Join-Path $app 'package.json'))) { Fail "找不到 app\package.json，请在项目根目录运行本脚本" }
if (-not (Test-Path -LiteralPath (Join-Path $app 'node_modules'))) { Fail "app\node_modules 不存在，请先执行  npm install  （或加 -Full 参数）" }

$running = Get-Process -Name '积分客户管理' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "[!!] 检测到「积分客户管理」正在运行，文件可能被占用。" -ForegroundColor Yellow
  Write-Host "     请先关闭程序窗口再继续（数据已实时写入，关闭不会丢）。" -ForegroundColor Yellow
  if (-not $Dev) { Fail "已中止，避免复制出半个程序" }
}

# ---------- 1. 依赖 ----------
if ($Full) {
  Info "重新安装依赖（含开发依赖）..."
  Push-Location $app
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm install 失败" }
  Pop-Location
  Ok "依赖安装完成"
}

# ---------- 2. 构建界面 ----------
if (-not $SkipBuild -and -not $Dev) {
  Info "构建 React 界面（app\src -> app\dist）..."
  Push-Location $app
  npm run build:render
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "界面构建失败，请查看上面的报错（通常是 JSX 语法或组件引用错误）" }
  Ok "界面构建完成"
}

# ---------- 3. 调试模式：Vite 热更新 + Electron ----------
if ($Dev) {
  Info "启动 Vite 开发服务（端口 5173）..."
  $vite = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev:render' `
          -WorkingDirectory $app -WindowStyle Hidden -PassThru

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $c.Connect('127.0.0.1', 5173)
      $c.Close()
      $ready = $true
      break
    } catch { }
  }
  if (-not $ready) {
    try { Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue } catch { }
    Fail "Vite 未能在 20 秒内启动，请手动在 app 目录执行 npm run dev:render 查看报错"
  }
  Ok "Vite 已就绪：http://127.0.0.1:5173"

  $env:VITE_DEV_SERVER_URL = 'http://127.0.0.1:5173'
  Info "打开调试窗口（改 src\ 保存后界面自动刷新，改 electron\ 需关窗口重开）..."
  & (Join-Path $app 'node_modules\electron\dist\electron.exe') $app

  Remove-Item Env:\VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue
  try { Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue } catch { }
  Ok "调试结束，Vite 已关闭"
  exit 0
}

# ---------- 4. 同步到成品目录 ----------
if (-not (Test-Path -LiteralPath $resApp)) { Fail "找不到成品目录：$resApp（若已删除，需要重新做一次完整打包）" }

Info "同步 dist\ 到成品..."
$null = robocopy (Join-Path $app 'dist') (Join-Path $resApp 'dist') /MIR /NFL /NDL /NJH /NJS /NP

Info "同步 electron\ 到成品..."
$null = robocopy (Join-Path $app 'electron') (Join-Path $resApp 'electron') /MIR /NFL /NDL /NJH /NJS /NP

if (Test-Path -LiteralPath (Join-Path $app 'build')) {
  $null = robocopy (Join-Path $app 'build') (Join-Path $resApp 'build') /MIR /NFL /NDL /NJH /NJS /NP
}

$exe = Join-Path $out '积分客户管理.exe'
if (-not (Test-Path -LiteralPath $exe)) { Fail "成品里缺少 积分客户管理.exe" }

Ok "已同步到成品目录"
Write-Host ""
Write-Host "双击运行：$exe" -ForegroundColor Green
Write-Host "（robocopy 退出码 1 表示“有文件被复制”，属正常，不是错误）" -ForegroundColor DarkGray
