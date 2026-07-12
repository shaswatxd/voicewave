; ═══════════════════════════════════════════════════════
; VoiceWave Custom NSIS Installer Script
; - Detects & silently removes previous installation before installing
; - Windows Firewall rules (allows WebRTC/Socket.IO)
;
; NOTE on antivirus false positives: a silent AV exclusion is a known
; malware/PUP red flag — it has been intentionally left out.
; Proper fixes:
;   1. Code-sign the .exe with a real certificate (OV/EV)
;   2. Submit for false-positive review:
;      https://www.microsoft.com/en-us/wdsi/filesubmission
;      https://www.virustotal.com
; ═══════════════════════════════════════════════════════

; ── customInit → runs inside .onInit (a Function), so all NSIS commands valid ──
; Detects any existing VoiceWave installation and silently removes it BEFORE
; the new installer runs — prevents duplicate entries in Add/Remove Programs.
!macro customInit
  ; Check per-user install first (perMachine=false is our default)
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VoiceWave" "UninstallString"

  ; Fallback: check per-machine install
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\VoiceWave" "UninstallString"
  ${EndIf}

  ; If a previous installation was found, uninstall it silently
  ${If} $R0 != ""
    ; /S = silent uninstall, no UI shown to user
    ExecWait '$R0 /S'
    ; Brief pause so the uninstaller process fully exits before we continue
    Sleep 1500
  ${EndIf}
!macroend

!macro customInstall
  ; ── Add Windows Firewall rules for VoiceWave ──
  ; Required for WebRTC peer-to-peer connections and Socket.IO signaling
  DetailPrint "Configuring firewall rules..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave Outbound"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave" dir=in action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave Outbound" dir=out action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
  DetailPrint "Firewall rules configured."
!macroend

!macro customInstallMode
  ; Force current-user install — skip "Only for me / For all users" page
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customUnInstall
  ; ── Remove Windows Firewall rules on uninstall ──
  DetailPrint "Removing firewall rules..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave Outbound"'
!macroend
