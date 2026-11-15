# 构建 Windows 安装包（NSIS）
# 用法：
#   .\构建安装包.ps1            构建界面 + 打包安装包
#   .\构建安装包.ps1 -SkipBuild  跳过界面构建，直接打包（改过 electron/ 或 package.json 时用）
param([switch]$SkipBuild)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $root 'app'

if (-not (Test-Path -LiteralPath $app)) {
  Write-Host "[错误] 找不到源码目录：$app" -ForegroundColor Red
  exit 1
}

# 正在运行的程序会锁住 release 里的文件，先关掉
$procs = Get-Process -Name '积分客户管理', '积分客户管理系统' -ErrorAction SilentlyContinue
if ($procs) {
  Write-Host "[..] 检测到程序正在运行，先关闭..."
  $procs | Stop-Process -Force
  Start-Sleep -Seconds 3
}

Set-Location -LiteralPath $app

if (-not $SkipBuild) {
  Write-Host "[..] 构建 React 界面（app\src -> app\dist）..."
  npm run build:render
  if ($LASTEXITCODE -ne 0) { Write-Host "[错误] 界面构建失败" -ForegroundColor Red; exit 1 }
  Write-Host "[OK] 界面构建完成"
}

# 打包时需要的下载镜像（本机 .npmrc 已配，这里再显式给一份保险）
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

Write-Host "[..] 打包安装包（electron-builder / NSIS）..."
npx --yes electron-builder --win nsis
if ($LASTEXITCODE -ne 0) { Write-Host "[错误] 打包失败" -ForegroundColor Red; exit 1 }

$out = Join-Path $app 'release'
$installer = Get-ChildItem -LiteralPath $out -Filter '*安装包*.exe' -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $installer) { Write-Host "[错误] 没找到安装包产物" -ForegroundColor Red; exit 1 }

# 复制一份到项目根目录，方便直接取用
$copy = Join-Path $root $installer.Name
Copy-Item -LiteralPath $installer.FullName -Destination $copy -Force

$size = [math]::Round($installer.Length / 1MB, 2)
Write-Host "[OK] 安装包已生成：$copy（$size MB）" -ForegroundColor Green
Write-Host "     目录版（免安装）仍在：$(Join-Path $root '积分客户管理系统')"
exit 0
