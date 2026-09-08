param(
    [string]$Token,
    [string]$ServerHost = "127.0.0.1",
    [int]$Port = 10011
)
$ErrorActionPreference = "Stop"
$client = New-Object System.Net.Sockets.TcpClient($ServerHost, $Port)
$stream = $client.GetStream()
$buffer = New-Object byte[] 8192
$read = $stream.Read($buffer, 0, 8192)
$banner = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
Write-Output "BANNER: $banner"

function Invoke-Query($cmd) {
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($cmd + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
    Start-Sleep -Milliseconds 800
    $ms = New-Object System.IO.MemoryStream
    $deadline = (Get-Date).AddMilliseconds(1500)
    while ((Get-Date) -lt $deadline) {
        if ($stream.DataAvailable) {
            $r = $stream.Read($buffer, 0, 8192)
            $ms.Write($buffer, 0, $r)
        } else {
            Start-Sleep -Milliseconds 100
        }
    }
    $resp = [System.Text.Encoding]::ASCII.GetString($ms.ToArray())
    Write-Output "CMD: $cmd"
    Write-Output "RESP: $resp"
    return $resp
}

Invoke-Query "use 1"
Invoke-Query "privilegekeyadd tokentext=$Token"
Invoke-Query "apikeyadd scope=manage lifetime=0 clientuid=ServerQuery"
Invoke-Query "quit"
$client.Close()