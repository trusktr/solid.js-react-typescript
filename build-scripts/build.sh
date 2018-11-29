#!/usr/bin/env bash

# Builds the annotator from the command line.
# MUST be run from the base directory (NOT from build-scripts)

# Exit if there is an error
set -e

echo "**** Installing dependencies"
npm install
echo "**** Installing dependencies complete"

echo "**** Rebuilding electron..."
./node_modules/.bin/electron-rebuild
echo "**** Rebuilding electron complete"

echo "**** Compiling..."
# npm run lint TODO: enable so that build fails on lint errors once we fix the current errors
npm run typecheck
echo "**** Compiling complete"