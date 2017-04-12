#!/bin/bash

# "es2016-node5",
# 		"stage-0",
# 		"react",
# 		"async-to-bluebird"
# 	],
# 	"sourceMaps": "both",
# 	"plugins": [
# 		"transform-es2015-classes",
# 		"transform-runtime"

PKGS="semver shelljs aws-sdk source-map-support lodash aws-sdk babel-cli babel-preset-es2016-node5 babel-polyfill \
	babel-preset-stage-0 babel-preset-react babel-preset-async-to-bluebird babel-preset-es2016-node5 babel-plugin-transform-es2015-classes \
    babel-plugin-transform-runtime gulp electron-prebuilt@1.3.5"

INSTALL_PKGS=""

for pkg in ${PKGS}
do
	if [ ! -e "node_modules/${pkg}" ]; then
    	INSTALL_PKGS="${pkg} ${INSTALL_PKGS}"
    fi
done

echo "INSTALLING PKGS: ${INSTALL_PKGS}"

if [ "${INSTALL_PKGS}" != "" ];then
	npm i ${INSTALL_PKGS}
fi

