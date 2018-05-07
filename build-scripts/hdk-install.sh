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

echo "**** Copying config..."
cp $1/local.yaml packages/config/
echo "**** Copying config complete"
