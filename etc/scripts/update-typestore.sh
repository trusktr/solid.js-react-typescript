#!/bin/bash


if [ "$1" == "local" ]; then
	echo "Installing from local"
	npm i \
		typestore-mocks@../typestore/packages/typestore-mocks \
		typestore-plugin-pouchdb@../typestore/packages/typestore-plugin-pouchdb \
		typestore@../typestore/packages/typestore

	exit 0
fi

VERSION="latest"
if [ "$1" != "" ]; then
	VERSION=$1
fi

OPTS="$2 $3 $4"


npm i ${OPTS}  \
	typestore-mocks@${VERSION} \
	typestore-plugin-pouchdb@${VERSION} \
	typestore@${VERSION}
