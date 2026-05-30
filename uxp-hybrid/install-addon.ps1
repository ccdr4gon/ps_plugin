# 把编译好的 addon 复制进插件 win\x64。
# 用法：在 UDT 里 Unload 插件（或关掉 PS）释放占用后运行本脚本，再 Load。
$src  = "C:\Users\ccdragon\_code\ps_plugin\uxp-hybrid\addon\ColorPaletteSampler.uxpaddon"
$dest = "C:\Users\ccdragon\_code\ps_plugin\uxp-hybrid\plugin\win\x64\ColorPaletteSampler.uxpaddon"
try {
    Copy-Item $src $dest -Force -ErrorAction Stop
    Write-Host "OK: addon 已复制 ->" $dest
} catch {
    Write-Host "失败（仍被占用）：先在 UDT 里 Unload 插件 / 关掉 PS，再重试。"
    Write-Host $_.Exception.Message
}
