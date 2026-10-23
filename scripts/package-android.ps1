$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$javaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { Join-Path $env:ProgramFiles 'Android/Android Studio/jbr' }
if (!(Test-Path -LiteralPath (Join-Path $javaRoot 'bin/java.exe'))) { throw 'JDK 21 not found; set JAVA_HOME.' }
if (!(Test-Path -LiteralPath (Join-Path $sdkRoot 'platform-tools/adb.exe'))) { throw 'Android SDK not found; set ANDROID_HOME.' }
$env:JAVA_HOME = $javaRoot
$env:ANDROID_HOME = $sdkRoot
Push-Location (Join-Path $projectRoot 'android')
try {
    & .\gradlew.bat --no-daemon --max-workers=2 assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed: $LASTEXITCODE" }
} finally { Pop-Location }
$version = (Get-Content -Raw (Join-Path $projectRoot 'package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a stable numeric app version.' }
$outputDir = Join-Path $projectRoot "outputs/native-$version/android"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$target = Join-Path $outputDir "FirstExportOrder-$version-android-test.apk"
Copy-Item -LiteralPath (Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination $target
Write-Output "APK: $target"
$stream = [System.IO.File]::OpenRead($target)
$sha = [System.Security.Cryptography.SHA256]::Create()
try { Write-Output ('SHA256: ' + [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()) }
finally { $stream.Dispose(); $sha.Dispose() }
