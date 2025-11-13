@echo off
REM EDData Collector Docker Build Script for Windows
REM Creates and manages Docker images for the EDData Collector

setlocal enabledelayedexpansion

REM Configuration
set "IMAGE_NAME=ghcr.io/eddataapi/eddata-collector"
for /f "tokens=*" %%i in ('node -p "require('./package.json').version"') do set "VERSION=%%i"
set "LATEST_TAG=latest"
for /f "tokens=*" %%i in ('powershell -Command "Get-Date -Format 'yyyyMMdd'"') do set "DATE_TAG=%%i"

echo 🚀 EDData Collector Docker Build Script
echo ==================================

if "%1"=="" goto :all
if "%1"=="build" goto :build
if "%1"=="push" goto :push  
if "%1"=="test" goto :test
if "%1"=="scan" goto :scan
if "%1"=="all" goto :all
if "%1"=="help" goto :help
goto :help

:build
echo 📦 Building Docker image...
docker build ^
    --target production ^
    --build-arg BUILD_DATE=%DATE%T%TIME% ^
    --build-arg VCS_REF=%VERSION% ^
    --build-arg VERSION=%VERSION% ^
    -t %IMAGE_NAME%:%VERSION% ^
    -t %IMAGE_NAME%:%DATE_TAG% ^
    -t %IMAGE_NAME%:%LATEST_TAG% ^
    .

if !ERRORLEVEL! equ 0 (
    echo ✅ Image built successfully!
) else (
    echo ❌ Build failed!
    exit /b 1
)
goto :eof

:push
echo 📤 Pushing Docker image to registry...
docker push %IMAGE_NAME%:%VERSION%
docker push %IMAGE_NAME%:%DATE_TAG%
docker push %IMAGE_NAME%:%LATEST_TAG%

if !ERRORLEVEL! equ 0 (
    echo ✅ Images pushed successfully!
) else (
    echo ❌ Push failed!
    exit /b 1
)
goto :eof

:test
echo 🧪 Running tests...
npm test

if !ERRORLEVEL! equ 0 (
    echo ✅ Tests passed!
) else (
    echo ❌ Tests failed!
    exit /b 1
)
goto :eof

:scan
where trivy >nul 2>nul
if !ERRORLEVEL! equ 0 (
    echo 🔒 Running security scan...
    trivy image %IMAGE_NAME%:%LATEST_TAG%
) else (
    echo ⚠️  Trivy not installed, skipping security scan
)
goto :eof

:all
if not "%SKIP_TESTS%"=="true" call :test
call :build
if not "%SKIP_SCAN%"=="true" call :scan

if "%PUSH_IMAGE%"=="true" call :push

echo 🎉 Build process completed!
echo Built images:
echo   - %IMAGE_NAME%:%VERSION%
echo   - %IMAGE_NAME%:%DATE_TAG%  
echo   - %IMAGE_NAME%:%LATEST_TAG%
goto :eof

:help
echo Usage: %0 [OPTION]
echo.
echo Options:
echo   build     Build Docker image
echo   push      Push image to registry (requires build first)
echo   test      Run tests
echo   scan      Run security scan
echo   all       Build, test, scan, and push
echo   help      Show this help message
echo.
echo Environment variables:
echo   SKIP_TESTS=true     Skip running tests
echo   SKIP_SCAN=true      Skip security scanning
echo   PUSH_IMAGE=true     Push images after build
goto :eof