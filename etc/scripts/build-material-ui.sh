#!/bin/bash -e

EPICDIR=${PWD}
EPICMATERIALDIR=${EPICDIR}/node_modules/material-ui

rm -Rf /tmp/material-ui
pushd /tmp
git clone https://github.com/densebrain/material-ui.git
pushd material-ui
npm install
npm run build

#cp -R build ${EPICMATERIALDIR}
popd
popd

rm -Rf ${EPICMATERIALDIR}
npm i material-ui@/tmp/material-ui/build

#pushd libs/material-ui
#npm i
#npm run build
#npm link
#popd

#ln -fs ${PWD}/libs/material-ui/build ${PWD}/node_modules/material-ui
#npm link material-ui
