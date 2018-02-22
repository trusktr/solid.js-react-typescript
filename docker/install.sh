#!/usr/bin/env bash

echo "**** Installing dependencies"
npm install
echo "**** Installing dependencies complete"

echo "**** Rebuilding electron..."
./node_modules/.bin/electron-rebuild
echo "**** Rebuilding electron complete"

echo "**** Creating symbolic link(s)..."
pushd node_modules/grpc/src/node/extension_binary/
ln -s electron-v1.7-linux-x64-\{libc\} electron-v1.7-linux-x64-glibc
popd

echo "**** Compiling..."
./etc/scripts/compile.js
echo "**** Compiling complete"
