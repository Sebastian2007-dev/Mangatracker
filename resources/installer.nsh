; installer.nsh
; Beendet laufende Instanzen und deinstalliert ALLE alten "Manga Tracker"-Einträge
; bevor die neue Version installiert wird.

!macro customInit
  ; 1. Prozess beenden (kein Fehler wenn nicht läuft)
  ExecWait 'taskkill /F /IM MangaTracker.exe'
  Sleep 1000

  ; 2. PowerShell-Skript schreiben und alle alten Eintraege silent deinstallieren.
  ;    $$ erzeugt ein einzelnes $ in der Ausgabe (NSIS-Escape fuer Dollarzeichen).
  FileOpen $0 "$TEMP\mt_cleanup.ps1" w
  FileWrite $0 '$$paths = @($\n'
  FileWrite $0 '    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",$\n'
  FileWrite $0 '    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",$\n'
  FileWrite $0 '    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"$\n'
  FileWrite $0 ')$\n'
  FileWrite $0 'foreach ($$p in $$paths) {$\n'
  FileWrite $0 '    try {$\n'
  FileWrite $0 '        $$found = Get-ChildItem $$p -ErrorAction Stop |$\n'
  FileWrite $0 '            Where-Object { $$_.GetValue("DisplayName") -like "Manga Tracker*" }$\n'
  FileWrite $0 '        foreach ($$entry in $$found) {$\n'
  FileWrite $0 '            $$u = $$entry.GetValue("UninstallString")$\n'
  FileWrite $0 '            if ($$u) {$\n'
  FileWrite $0 '                $$exe = $$u.Trim([char]34).Split(" ")[0]$\n'
  FileWrite $0 '                if (Test-Path $$exe) {$\n'
  FileWrite $0 '                    Start-Process $$exe -ArgumentList "/S" -Wait -NoNewWindow$\n'
  FileWrite $0 '                }$\n'
  FileWrite $0 '            }$\n'
  FileWrite $0 '        }$\n'
  FileWrite $0 '    } catch {}$\n'
  FileWrite $0 '}$\n'
  FileClose $0

  ExecWait 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$TEMP\mt_cleanup.ps1"'
  Delete "$TEMP\mt_cleanup.ps1"
  Sleep 2000
!macroend

!macro customInstall
  ExecWait 'taskkill /F /IM MangaTracker.exe'
  Sleep 500
!macroend

!macro customUnInstall
  ExecWait 'taskkill /F /IM MangaTracker.exe'
  Sleep 500
!macroend
