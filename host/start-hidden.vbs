' 隐藏启动 node server.js（无控制台窗口）
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "E:\projects\journal\host"
shell.Run "node server.js", 0, False
