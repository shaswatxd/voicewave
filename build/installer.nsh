; ═══════════════════════════════════════════════════════
; VoiceWave Custom NSIS Installer Script
; - One-click installer (modern Discord/Spotify style)
; - Auto-detects & removes previous installation
; - Windows Firewall rules (WebRTC/Socket.IO)
; ═══════════════════════════════════════════════════════

; ── customInit → runs inside .onInit ──
; Silently remove any existing VoiceWave before installing the new version.
!macro customInit
  ; Check per-user install
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VoiceWave" "UninstallString"
  ; Fallback: check per-machine
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\VoiceWave" "UninstallString"
  ${EndIf}
  ; Silently remove old version if found
  ${If} $R0 != ""
    ExecWait '$R0 /S'
    Sleep 1500
  ${EndIf}
!macroend

!macro customInstall
  ; ── Firewall rules for WebRTC P2P ──
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave Outbound"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave" dir=in action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave Outbound" dir=out action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave Outbound"'
!macroend
