# Copy the freshly built addon into plugin\win\x64 (as the current SamplerN name).
# NOTE: PS locks a loaded .uxpaddon. Workflow when changing the addon: bump N (new filename),
#       update manifest.json (addon.name) and main.js (require), build, run this, then Remove+Add in UDT.
$src  = "C:\Users\ccdragon\_code\ps_plugin\uxp-hybrid\addon\ColorPaletteSampler.uxpaddon"
$dest = "C:\Users\ccdragon\_code\ps_plugin\uxp-hybrid\plugin\win\x64\ColorPaletteSampler9.uxpaddon"
try {
    Copy-Item $src $dest -Force -ErrorAction Stop
    Write-Host ("OK: addon copied -> " + $dest)
} catch {
    Write-Host "FAILED (file locked): in UDT Remove/Unload the plugin or close PS, then retry."
    Write-Host $_.Exception.Message
}
