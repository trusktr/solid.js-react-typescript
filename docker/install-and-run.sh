#!/usr/bin/env bash

echo "**** Installing npm"
npm install
echo "**** Installing npm complete"

echo "**** Rebuilding electron..."
./node_modules/.bin/electron-rebuild
echo "**** Rebuilding electron complete"

echo "**** Compiling..."
./etc/scripts/compile.js
echo "**** Compiling complete"

echo "**** Starting app"
npm run start
