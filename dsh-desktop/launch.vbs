' Launch start-desktop.bat with its console window hidden (window style 0).
Dim wsh, fso, bat
Set wsh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
bat = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "start-desktop.bat")
wsh.Run """" & bat & """", 0, False