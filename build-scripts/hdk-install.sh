#!/usr/bin/env bash

# Install script for running on the HDK host.  Installs the payload delivered
# via container

# Exit if there is an error
set -e

if [ "$#" -ne 1 ]; then
    echo "Please provide directory for visualizer config files"
    exit 1
fi

./build-scripts/build.sh

echo "**** Creating symbolic link(s)..."
unamestr=`uname`
ELECTRON_VERSION="1.7"
if [[ "$unamestr" == 'Darwin' ]]; then
	OS_STRING="darwin"
	SYMLINK_LIB_NAME=electron-v${ELECTRON_VERSION}-darwin-x64-unknown
else
	OS_STRING="linux"
	SYMLINK_LIB_NAME=electron-v${ELECTRON_VERSION}-linux-x64-glibc
fi
pushd node_modules/grpc/src/node/extension_binary/
rm -f $SYMLINK_LIB_NAME
ln -s electron-v${ELECTRON_VERSION}-${OS_STRING}-x64-\{libc\} $SYMLINK_LIB_NAME
popd

echo "**** Copying config..."
cp $1/local.yaml packages/config/
echo "**** Copying config complete"
