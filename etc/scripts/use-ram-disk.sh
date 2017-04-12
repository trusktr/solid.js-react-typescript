#!/bin/bash -ex

RAM_ROOT=${HOME}/DevelopmentRAM

DIR=${HOME}/Development/densebrain/epictask
NODE_MODULES=${DIR}/node_modules.disk
RAM_DIR=${RAM_ROOT}/epictask
RAM_NODE_MODULES=${RAM_DIR}/node_modules
SYNC_CMD="rsync -au --copy-links ${NODE_MODULES}/ ${RAM_NODE_MODULES}"


function makeRamDir {
	mkdir -p ${RAM_DIR}/$1
	ln -fs ${RAM_DIR}/$1 ${DIR}/$1
}

if [ -e ${NODE_MODULES} ];then
	rm node_modules || true
	mv ${NODE_MODULES} node_modules
fi

mv  node_modules ${NODE_MODULES}

if [ -e "${RAM_ROOT}" ];then
	echo "RAM DISK EXISTS - copying ${RAM_ROOT}"
	mkdir -p "${RAM_NODE_MODULES}"
	${SYNC_CMD}

	makeRamDir .awcache
	makeRamDir dist

	ln -s ${RAM_NODE_MODULES} ${PWD}/node_modules

	pushd "${RAM_DIR}"
	npm link electron-prebuilt gulp remotedev-server material-ui-build react-valid-props
	popd

else
	echo "RAM DISK DIES NOT EXIST ${RAM_ROOT}"
fi
