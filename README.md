# Annotator

This is a web-based GUI to allow humans to mark up vector features on top of our raster data sets.

## Prerequisites
- [Node.js (includes npm)](https://nodejs.org/en/download/)

### Private NPM repository
Set up a [personal account](https://www.npmjs.com/signup).

Get access to the @mapperai NPM repository, with your NPM username, from [Alonso](alonso@mapper.ai). Then store your credentials locally so that npm can find them:

    npm adduser --scope=@mapperai --always-auth

### Install application dependencies for testing on the host system
    npm install

## Build

### Run the incremental compiler
    ./etc/scripts/compile-watch.js 

### Run the [electron](https://www.npmjs.com/package/electron) debug GUI
 - Open the project in IntelliJ IDEA.
 - Under Run>Run…, select the Mapper Annotator configuration and run it.
