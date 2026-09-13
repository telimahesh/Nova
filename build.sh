#!/bin/bash

# Zoya App Universal Build Script for Termux/VCode
echo "Starting Zoya App Build Process..."

# 1. Fix JAVA_HOME, ANDROID_HOME and AAPT2 for Termux
if [ -n "$PREFIX" ]; then
    # Dynamically find Java path
    JAVA_PATH=$(command -v java)
    if [ -n "$JAVA_PATH" ]; then
        export JAVA_HOME=$(dirname $(dirname $(readlink -f "$JAVA_PATH")))
    else
        export JAVA_HOME="$PREFIX"
    fi

    # Set Android SDK path for Termux
    if [ -d "$PREFIX/share/android-sdk" ]; then
        export ANDROID_HOME="$PREFIX/share/android-sdk"
        echo "sdk.dir=$ANDROID_HOME" > local.properties
    fi
fi

if [ -f "/data/data/com.termux/files/usr/bin/aapt2" ]; then
    echo "Setting AAPT2 path for Termux..."
    export GRADLE_OPTS="-Dandroid.aapt2.executable=/data/data/com.termux/files/usr/bin/aapt2"
fi

echo "Using JAVA_HOME: $JAVA_HOME"
echo "Using ANDROID_HOME: $ANDROID_HOME"

# 2. Clean old builds
echo "Cleaning old build files..."
sh gradlew clean

# 3. Build Debug APK
echo "Building APK..."
sh gradlew assembleDebug

if [ $? -eq 0 ]; then
    echo "--------------------------------------------"
    echo "SUCCESS! APK is ready at:"
    echo "app/build/outputs/apk/debug/app-debug.apk"
    echo "--------------------------------------------"
else
    echo "BUILD FAILED! Please check the errors above."
fi
