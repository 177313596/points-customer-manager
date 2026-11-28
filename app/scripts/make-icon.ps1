# 由一张方形图片生成应用图标：build\icon.png（512，窗口/任务栏用）+ build\icon.ico（16~256 多尺寸，exe 与安装包用）
# 用法： .\make-icon.ps1 -Source 'D:\桌面\xxx.png'
# 形状：超椭圆（连续曲率圆角 / squircle），指数 n=5，四角透明度按像素覆盖度做抗锯齿
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$OutDir = (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\build'),
  [double]$SquircleN = 5.0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# 连续曲率遮罩：|x/a|^n + |y/b|^n <= 1，逐像素 4x4 超采样算覆盖度，alpha = 255 * 覆盖度
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SquircleMask
{
    public static void Apply(Bitmap bmp, double n)
    {
        int w = bmp.Width, h = bmp.Height;
        BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        byte[] buf = new byte[data.Stride * h];
        Marshal.Copy(data.Scan0, buf, 0, buf.Length);
        double cx = (w - 1) / 2.0, cy = (h - 1) / 2.0;
        double a = w / 2.0, b = h / 2.0;
        const int SS = 4;
        int total = SS * SS;
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int inside = 0;
                for (int j = 0; j < SS; j++)
                {
                    double py = y + (j + 0.5) / SS - cy;
                    double ny = Math.Pow(Math.Abs(py / b), n);
                    for (int i = 0; i < SS; i++)
                    {
                        double px = x + (i + 0.5) / SS - cx;
                        if (Math.Pow(Math.Abs(px / a), n) + ny <= 1.0) inside++;
                    }
                }
                int idx = y * data.Stride + x * 4;
                buf[idx + 3] = (byte)(255 * inside / total);
            }
        }
        Marshal.Copy(buf, 0, data.Scan0, buf.Length);
        bmp.UnlockBits(data);
    }
}
"@ -ReferencedAssemblies @(
  [System.Drawing.Bitmap].Assembly.Location,
  [System.Drawing.Rectangle].Assembly.Location,
  [System.Object].Assembly.Location
)

function Log($m) { Write-Host "[..] $m" -ForegroundColor Cyan }

$src = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
try {
  $w = $src.Width; $h = $src.Height
  Log "源图 $w x $h"
  # 取中间正方形
  $side = [Math]::Min($w, $h)
  $sx = [int](($w - $side) / 2)
  $sy = [int](($h - $side) / 2)

  $tmp = Join-Path $env:TEMP ('pm-icon-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null

  $sizes = @(16, 24, 32, 48, 64, 128, 256)
  # 小尺寸单独取景：16px 下整张方图（含外圈科技环）会糊成一团，
  # 所以 16/24/32/48 向内多裁一点，把"积"字放大，笔画才立得住；64 起恢复整张方图。
  $cropRate = @{ 16 = 0.72; 24 = 0.78; 32 = 0.84; 48 = 0.92 }
  # 16/24/32 再补一点对比度（原图浅底、银色描边，缩到这个尺寸会发灰），让深色笔画更实
  $contrast = @{ 16 = 1.60; 24 = 1.45; 32 = 1.35 }
  $bright   = @{ 16 = -0.18; 24 = -0.14; 32 = -0.10 }
  $files = @()
  foreach ($s in $sizes) {
    $rate = 1.0
    if ($cropRate.ContainsKey($s)) { $rate = $cropRate[$s] }
    $crop = [int]($side * $rate)
    $cx = $sx + [int](($side - $crop) / 2)
    $cy = $sy + [int](($side - $crop) / 2)
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
      $g.DrawImage($src, $rect, $cx, $cy, $crop, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    } finally { $g.Dispose() }

    if ($contrast.ContainsKey($s)) {
      $cm = New-Object System.Drawing.Imaging.ColorMatrix
      $c = $contrast[$s]; $b = $bright[$s]
      $cm.Matrix00 = $c; $cm.Matrix11 = $c; $cm.Matrix22 = $c
      $cm.Matrix40 = $b; $cm.Matrix41 = $b; $cm.Matrix42 = $b
      $ia = New-Object System.Drawing.Imaging.ImageAttributes
      $ia.SetColorMatrix($cm)
      $b2 = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $g2 = [System.Drawing.Graphics]::FromImage($b2)
      try {
        $g2.DrawImage($bmp, (New-Object System.Drawing.Rectangle(0, 0, $s, $s)), 0, 0, $s, $s, [System.Drawing.GraphicsUnit]::Pixel, $ia)
      } finally { $g2.Dispose() }
      $bmp.Dispose()
      $bmp = $b2
    }

    $f = Join-Path $tmp ("$s.png")
    [SquircleMask]::Apply($bmp, $SquircleN)
    $bmp.Save($f, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $files += $f
  }

  # 大图：512 作为 icon.png（窗口图标，取 512 更清晰；ico 里仍含 256）
  $bmp512 = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($bmp512)
  try {
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g2.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, 512, 512)), $sx, $sy, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
  } finally { $g2.Dispose() }
  $iconPng = Join-Path $OutDir 'icon.png'
  [SquircleMask]::Apply($bmp512, $SquircleN)
  $bmp512.Save($iconPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp512.Dispose()

  # 手工拼 ICO：ICONDIR + 目录项 + 各尺寸 PNG 数据（Vista 起支持 PNG 帧）
  $entries = @()
  $offset = 6 + 16 * $sizes.Count
  foreach ($f in $files) {
    $len = (Get-Item -LiteralPath $f).Length
    $entries += [PSCustomObject]@{ File = $f; Len = $len; Offset = $offset }
    $offset += $len
  }

  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  try {
    $bw.Write([UInt16]0)                       # reserved
    $bw.Write([UInt16]1)                       # type = icon
    $bw.Write([UInt16]$sizes.Count)            # count
    foreach ($e in $entries) {
      $name = [System.IO.Path]::GetFileNameWithoutExtension($e.File)
      $s = [int]$name
      $dim = $s
      if ($s -ge 256) { $dim = 0 }
      $bw.Write([Byte]$dim)
      $bw.Write([Byte]$dim)
      $bw.Write([Byte]0)                       # color count
      $bw.Write([Byte]0)                       # reserved
      $bw.Write([UInt16]1)                     # planes
      $bw.Write([UInt16]32)                    # bit count
      $bw.Write([UInt32]$e.Len)
      $bw.Write([UInt32]$e.Offset)
    }
    foreach ($e in $entries) {
      $bw.Write([System.IO.File]::ReadAllBytes($e.File))
    }
    $bw.Flush()
    $ico = Join-Path $OutDir 'icon.ico'
    [System.IO.File]::WriteAllBytes($ico, $ms.ToArray())
  } finally { $bw.Dispose(); $ms.Dispose() }

  # 便于目视检查的预览图
  Copy-Item -LiteralPath $files[-1] -Destination (Join-Path $env:TEMP 'pm-icon-preview.png') -Force
  Remove-Item -LiteralPath $tmp -Recurse -Force

  Log ("已生成：" + $iconPng + "：" + (Get-Item -LiteralPath $iconPng).Length + " 字节")
  Log ("已生成：" + (Join-Path $OutDir 'icon.ico') + "：" + (Get-Item -LiteralPath (Join-Path $OutDir 'icon.ico')).Length + " 字节（含 " + ($sizes -join '/') + " 七种尺寸）")
} finally { $src.Dispose() }
