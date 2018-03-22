#!/usr/bin/env bash

# Builds the annotator from the command line.
# MUST be run from the base directory (NOT from build-scripts)

echo "**** Installing dependencies"
npm install
echo "**** Installing dependencies complete"

echo "**** Rebuilding electron..."
./node_modules/.bin/electron-rebuild
echo "**** Rebuilding electron complete"

echo "**** Compiling..."
./etc/scripts/compile.js
echo "**** Compiling complete"

