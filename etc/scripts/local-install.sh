#!/bin/bash -e


GLOBAL_MODS="react-valid-props reflect-metadata redux react react-dom react-tap-event-plugin react-addons-create-fragment react-addons-transition-group material-ui typelogger typedux typestore typestore-mocks typestore-plugin-pouchdb"

if [ ! -h "node_modules/material-ui" ]; then
	npm i -g redux@3.5.2 react@15.3.0 react-dom@15.3.0 react-tap-event-plugin@1.0.0 react-addons-create-fragment@15.3.0 react-addons-transition-group@15.3.0
	rm -Rf node_modules

	echo "Material UI needs to be build and setup"

	if [ -e "../material-ui" ]; then
		echo "Building material-ui"
		pushd ../material-ui
		rm -Rf node_modules build
		npm link react react-dom react-tap-event-plugin react-addons-create-fragment react-addons-transition-group
		npm i
		npm run build
		pushd build
		npm link react react-dom react-tap-event-plugin react-addons-create-fragment react-addons-transition-group
		npm link
		popd
		popd
		npm link material-ui
	else
		echo "Material-ui is not available one level up, ERROR"
		exit 1
	fi
fi

echo "Linking modules ${GLOBAL_MODS}"
npm link ${GLOBAL_MODS}
echo "Installing others"
npm i

echo
echo
echo "Ready to code"



