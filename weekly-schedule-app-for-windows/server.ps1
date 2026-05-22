$port = 8000
$root = Join-Path $PSScriptRoot "dist"
$url = "http://localhost:$port/"

Write-Host ""
Write-Host "Weekly Schedule App is running."
Write-Host ""
Write-Host "Please open Microsoft Edge and visit:"
Write-Host $url
Write-Host ""
Write-Host "Do not close this black window while using the app."
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "Failed to start local server."
    Write-Host "Maybe port 8000 is already in use."
    Write-Host ""
    Write-Host $_.Exception.Message
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit
}

while ($true) {
    try {
        $context = $listener.GetContext()
        $requestPath = [uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))

        if ($requestPath -eq "") {
            $requestPath = "index.html"
        }

        $filePath = Join-Path $root $requestPath

        if (Test-Path $filePath -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()

            switch ($extension) {
                ".html" { $context.Response.ContentType = "text/html" }
                ".js"   { $context.Response.ContentType = "application/javascript" }
                ".css"  { $context.Response.ContentType = "text/css" }
                ".svg"  { $context.Response.ContentType = "image/svg+xml" }
                ".png"  { $context.Response.ContentType = "image/png" }
                ".jpg"  { $context.Response.ContentType = "image/jpeg" }
                ".jpeg" { $context.Response.ContentType = "image/jpeg" }
                ".ico"  { $context.Response.ContentType = "image/x-icon" }
                default { $context.Response.ContentType = "application/octet-stream" }
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $context.Response.StatusCode = 404
            $message = [System.Text.Encoding]::UTF8.GetBytes("File not found")
            $context.Response.OutputStream.Write($message, 0, $message.Length)
        }

        $context.Response.OutputStream.Close()
    } catch {
        Write-Host "Request error:"
        Write-Host $_.Exception.Message
    }
}
