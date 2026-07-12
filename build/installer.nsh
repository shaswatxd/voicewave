; ═══════════════════════════════════════════════════════
; VoiceWave Custom NSIS Installer Script
; - Windows Firewall rule (allows WebRTC/Socket.IO)
;
; NOTE on antivirus false positives: this script used to silently add a
; Windows Defender exclusion for the install directory. That's removed —
; a silent AV exclusion is a known malware/PUP red flag, it can itself
; trigger detections, and it leaves the install folder unscanned forever
; (a real risk if that folder is ever compromised by a future bad update).
; The legitimate fixes for unsigned-exe false positives are:
;   1. Code-sign the .exe with a real certificate (OV/EV) — this is the
;      actual long-term fix and builds SmartScreen reputation over time.
;   2. Submit the installer for false-positive review (free):
;      https://www.microsoft.com/en-us/wdsi/filesubmission
;      https://www.virustotal.com (check + request re-analysis)
; ═══════════════════════════════════════════════════════

!macro customInstall
  ; ── Add Windows Firewall rule for VoiceWave ──
  ; Required for WebRTC peer-to-peer connections and Socket.IO signaling
  DetailPrint "Adding firewall rule..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave" 2>nul'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave" dir=in action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave Outbound" dir=out action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
!macroend

!macro customInstallMode
  ; Force current-user install — skip "Only for me / For all users" page
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customUnInstall
  ; ── Remove Windows Firewall rules ──
  DetailPrint "Removing firewall rules..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave Outbound"'
!macroend
