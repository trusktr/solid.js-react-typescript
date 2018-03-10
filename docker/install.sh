#!/usr/bin/env bash

# Exit if there is an error
set -e

if [ "$#" -ne 1 ]; then
    echo "Please provide directory for visualizer config files"
    exit 1
fi


echo "**** Installing dependencies"
npm install
echo "**** Installing dependencies complete"

echo "**** Rebuilding electron..."
./node_modules/.bin/electron-rebuild
echo "**** Rebuilding electron complete"

echo "**** Creating symbolic link(s)..."
pushd node_modules/grpc/src/node/extension_binary/
LIB_NAME=electron-v1.7-linux-x64-glibc
rm $LIB_NAME
ln -s electron-v1.7-linux-x64-\{libc\} $LIB_NAME
popd

echo "**** Compiling..."
./etc/scripts/compile.js
echo "**** Compiling complete"

echo "**** Copying config..."
cp $1/local.yaml packages/config/
echo "**** Copying config complete"
