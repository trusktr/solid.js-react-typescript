# Annotator

This is a web-based GUI to allow humans to visualize point cloud data sets and to mark up vector features on top of them.

## Prerequisites

- [Node.js (includes npm)](https://nodejs.org/en/download/)

> **NOTE:** If you are using Node.js v10, you may get [this
> error](https://github.com/nodejs/nan/issues/763) when installing dependencies
> in the following steps. In this case, you can downgrade to v9 using the `n`
> package as follows:
>
> ```
> sudo npm install --global n
> n 9
> ```

### Private NPM repository

Set up a [personal NPM account](https://www.npmjs.com/signup).

Authenticate your local NPM CLI with your npmjs.com credentials:

```sh
npm login
```

Get access to the [`@mapperai` org on NPM](https://www.npmjs.com/org/mapperai) by giving your NPM username to [Alonso](alonso@mapper.ai).

You can now successfully install project dependencies, including private dependencies from the `@mapperai` org.

### Install OS dependencies

#### macOS

    brew install zeromq
    brew install pkgconfig

#### Debian/Ubuntu

```sh
sudo apt-get install libzmq-dev
```

### Install application dependencies (any OS)

```sh
npm install
```

## Configure

The application uses [nconf](https://www.npmjs.com/package/nconf) for configuration. It is set up to read configs from [yaml files](src/config), from environment variables, or from the command line. The command line switch is formatted as `--CONFIG_NAME=CONFIG_VALUE`.

See [the docs](documentation/configuration.md) for details.

## Run the app

#### With NPM

This starts the Electron app. There's no build required, just run it
(`@babel/register` handles TypeScript code on the fly):

    npm start

If you'd like linting and typechecks while developing, run

    npm run dev

#### With IntelliJ IDEA

- Open the project in IntelliJ IDEA.
- Under Run>Run…, select the Mapper Annotator configuration and run it.

## Rebuild

If you pull down the latest version of the code base and things stop working, try one or more of the following to clear out the caches.

```sh
npm install
npm rebuild
./node_modules/.bin/electron-rebuild
npm start # or npm run dev
```

## Manipulating data

### Point cloud tiles

Point clouds are the foundation of both live visualization and creating annotations. They can be loaded in a batch or streamed in on demand. See [the docs](documentation/point_cloud_tiles.md).

### Annotations

Annotation data is saved locally within this project by default, in `./data`. A set of annotations can be loaded or saved to disk using the menus in the application. There are some shortcuts in [configuration](documentation/configuration.md). Annotation files on disk can be merged in memory by loading them sequentially in the annotator. The application runs an auto-save process for annotations. Those files are in `./data/autosave` if you need them.

### Trajectory play-back

The application can play back a sequence of trajectories to fly through the point cloud. Trajectories are stored in a sequence of [TrajectoryMessage](https://github.com/Signafy/mapper-models/blob/master/src/main/proto/TrajectoryMessage.proto) protobufs, usually found in a `trajectory_lidar.md` file. Trajectory files must be pre-loaded in a [configuration](documentation/configuration.md) setting.
