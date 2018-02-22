# Annotator

This is a web-based GUI to allow humans to mark up vector features on top of our raster data sets.

## Prerequisites
- [Node.js (includes npm)](https://nodejs.org/en/download/)

### Private NPM repository
Set up a [personal account](https://www.npmjs.com/signup).

Get access to the @mapperai NPM repository, with your NPM username, from [Alonso](alonso@mapper.ai). Then store your credentials locally so that npm can find them:

    npm adduser --scope=@mapperai --always-auth

### Install application dependencies for testing on the host system
    brew install zeromq
    brew install pkgconfig
    npm install

## Configure
The application uses [nconf](https://www.npmjs.com/package/nconf) for configuration. It is set up to read configs from [yaml files](packages/config), from environment variables, or from the command line. The command line switch is formatted as `--CONFIG_NAME=CONFIG_VALUE`.

## Build

### Run the incremental compiler
    ./etc/scripts/compile-watch.js 

### Run the [electron](https://www.npmjs.com/package/electron) debug GUI
    npm run start

or

 - Open the project in IntelliJ IDEA.
 - Under Run>Run…, select the Mapper Annotator configuration and run it.

## Rebuild
If you pull down the latest version of the code base and things stop working, try one or more of the following to clear out the caches.

    npm install
    npm rebuild
    ./node_modules/.bin/electron-rebuild
    ./etc/scripts/compile-watch.js 

### gRPC binary
The `electron-rebuild` script installs a `grpc_node.node` binary, among other things. If you get an error like this at runtime:

    Cannot find module '.../node_modules/grpc/src/node/extension_binary/electron-v1.7-darwin-x64-unknown/grpc_node.node'

...you might already have the correct binary, but with the wrong name. Monkey-patch it until we come up with something better. Grab the name of the electron binary directory from the error message, and link it to the electron binary directory that was installed, something like this:

    pushd node_modules/grpc/src/node/extension_binary/
    ln -s electron-v1.7-darwin-x64-\{libc\} electron-v1.7-darwin-x64-unknown
    popd
