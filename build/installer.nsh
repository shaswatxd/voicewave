; ═══════════════════════════════════════════════════════
; VoiceWave Custom NSIS Installer Script
; - Windows Defender exclusion (prevents false positives)
; - Windows Firewall rule (allows WebRTC/Socket.IO)
; ═══════════════════════════════════════════════════════

!macro customInstall
  ; ── Add Windows Defender exclusion for install directory ──
  ; This prevents Defender from quarantining the unsigned Electron exe
  DetailPrint "Adding Windows Defender exclusion..."
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "try { Add-MpPreference -ExclusionPath \"$INSTDIR\" -ErrorAction SilentlyContinue } catch {}"'

  ; ── Add Windows Firewall rule for VoiceWave ──
  ; Required for WebRTC peer-to-peer connections and Socket.IO signaling
  DetailPrint "Adding firewall rule..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave" 2>nul'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave" dir=in action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="VoiceWave Outbound" dir=out action=allow program="$INSTDIR\VoiceWave.exe" enable=yes profile=any'
!macroend

!macro customUnInstall
  ; ── Remove Windows Defender exclusion ──
  DetailPrint "Removing Windows Defender exclusion..."
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "try { Remove-MpPreference -ExclusionPath \"$INSTDIR\" -ErrorAction SilentlyContinue } catch {}"'

  ; ── Remove Windows Firewall rules ──
  DetailPrint "Removing firewall rules..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="VoiceWave Outbound"'
!macroend
