# 从 exe 里抽 256 尺寸图标并拼成一张对比图，用于目视确认圆角是否已进包
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class IconExtract {
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  static extern uint PrivateExtractIcons(string szFileName, int nIconIndex, int cxIcon, int cyIcon, IntPtr[] phicon, uint[] piconid, uint nIcons, uint flags);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr hIcon);
  public static System.Drawing.Icon Get(string file, int size) {
    IntPtr[] h = new IntPtr[1];
    uint[] id = new uint[1];
    uint n = PrivateExtractIcons(file, 0, size, size, h, id, 1, 0);
    if (n == 0) return null;
    var ico = System.Drawing.Icon.FromHandle(h[0]);
    var clone = (System.Drawing.Icon)ico.Clone();
    DestroyIcon(h[0]);
    return clone;
  }
}
"@ -ReferencedAssemblies @([System.Drawing.Bitmap].Assembly.Location, [System.Object].Assembly.Location)

$exeApp = 'release\win-unpacked\积分客户管理系统.exe'
$exeInst = 'release\积分客户管理系统-安装包-1.1.4.exe'
$i1 = [IconExtract]::Get((Resolve-Path $exeApp).Path, 256)
$i2 = [IconExtract]::Get((Resolve-Path $exeInst).Path, 256)
$b1 = $i1.ToBitmap(); $b2 = $i2.ToBitmap()

$prev = '..\docs\screenshots\icon-embedded-preview.png'
$W = 620; $H = 320
$c = [System.Drawing.Bitmap]::new($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($c)
$g.Clear([System.Drawing.Color]::FromArgb(255, 236, 239, 244))
$g.DrawImage($b1, 34, 32, 256, 256)
$g.DrawImage($b2, 330, 32, 256, 256)
$f = [System.Drawing.Font]::new('Microsoft YaHei', 9)
$tb = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 70, 78, 90))
$g.DrawString('应用 exe', $f, $tb, 120, 5)
$g.DrawString('安装包 exe', $f, $tb, 415, 5)
$g.Dispose()
$c.Save((Join-Path (Get-Location) $prev), [System.Drawing.Imaging.ImageFormat]::Png)
$c.Dispose()

"应用 exe 图标 $($b1.Width)x$($b1.Height) / 安装包 $($b2.Width)x$($b2.Height)"
"左上角 alpha：应用 A=$($b1.GetPixel(2,2).A) / 安装包 A=$($b2.GetPixel(2,2).A)"
"预览：$(Join-Path (Get-Location) $prev)"
