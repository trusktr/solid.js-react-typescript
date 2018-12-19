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

```bash
npm login
```

Get access to the [`@mapperai` org on NPM](https://www.npmjs.com/org/mapperai) by giving your NPM username to [Alonso](alonso@mapper.ai).

You can now successfully install project dependencies, including private dependencies from the `@mapperai` org.

### Install application dependencies

```bash
npm install
```

## Configure

The application uses [nconf](https://www.npmjs.com/package/nconf) for configuration. It is set up to read configs from [yaml files](src/config), from environment variables, or from the command line. The command line switch is formatted as `--CONFIG_NAME=CONFIG_VALUE`.

See [the docs](documentation/configuration.md) for details.

## Run the app

### With NPM

#### Running within Saffron

```bash
npm run dev
```

#### Publish

```bash
npm version patch && git push --tags
```

#### Running within Saffron, with local Annotated Scene library

- Check out and install [mapper-annotated-scene](https://github.com/Signafy/mapper-annotated-scene).
- Read the docs there to export/link compiled artifacts to your personal npm repository.
- `npm link @mapperai/mapper-annotated-scene`
- `npm run dev`
- Check out and install Saffron.
- In Saffron, `npm run dev:dev`.
- When the Saffron app opens:
  - click the menu icon (looks like a 3x3 grid)
  - click `App Settings`
  - click `Add Directory`
  - navigate to the `mapper-annotator` directory and click `Open`
  - click the menu icon
  - click `Annotator`

### With IntelliJ IDEA

- Open the project in IntelliJ IDEA.
- Under Run>Run…, select the Mapper Annotator configuration and run it.

## Rebuild

If you pull down the latest version of the code base and things stop working, try one or more of the following to clear out the caches.

    rm -rf dist/
    rm -rf node_modules/
    npm install
    npm link @mapperai/mapper-annotated-scene
    npm run dev

## Code sanity

For linting, typechecks, formatting etc, try

    npm run typecheck
    npm run lint-all
    npm run prettier

See `package.json` for more options.

## Manipulating data

### Annotations

Annotation data is saved locally within this project by default, in `./data`. A set of annotations can be loaded or saved to disk using the menus in the application. There are some shortcuts in [configuration](documentation/configuration.md). Annotation files on disk can be merged in memory by loading them sequentially in the annotator. The application runs an auto-save process for annotations. Those files are in `./data/autosave` if you need them.
