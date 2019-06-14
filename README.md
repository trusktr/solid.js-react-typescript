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

## Run the app

### With NPM

#### Running within Saffron

```bash
npm run dev
```

#### Publish

The CI system (Jenkins) will see when a new tag is pushed to GitHub and will
publish that to S3 (see Jenkinsfile). To make a new version and push the tag,
run:

```bash
npm run publish-version-patch
```

There are also `publish-version-minor` and `publish-version-major` scripts for
publish minor and major versions.

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

_TODO_ update this

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

## Deploy

If you are deploying a version of Annotator which depends on updates in [mapper-annotated-scene](https://github.com/Signafy/mapper-annotated-scene)–which is usually the case–go deploy it first, and manually set the `@mapperai/mapper-annotated-scene` version in `package.json`.

### Build and Deploy to Development Environment

Decide how important you change is, then

    npm run version-patch

or

    npm run version-minor

or

    npm run version-major

That creates a release branch. Go to [mapper-annotator](https://github.com/Signafy/mapper-annotator) and make a pull request from the release branch to `develop`. Get it approved, and close it. That will kick off a build on [Jenkins](https://build.mapperai.net/job/mapper-annotator/job/develop/).

If the build succeeds it will leave a [new application artifact](https://s3.console.aws.amazon.com/s3/buckets/mapper-dev-saffron-apps/uploads/?region=us-east-1&tab=overview#) for dev in S3.

A dev version of [mapper-saffron](https://github.com/Signafy/mapper-saffron/) will find the artifact sooner or later so that you can download it and test it.

### Build and Deploy to Production Environment

Go to [mapper-annotator](https://github.com/Signafy/mapper-annotator) and make a pull request from the release branch to `master`. Get it approved, and close it. That will kick off a build on [Jenkins](httpshttps://build.mapperai.net/job/mapper-annotator/job/master/).

If the build succeeds it will leave a [new application artifact](https://s3.console.aws.amazon.com/s3/buckets/mapper-prod-saffron-apps/uploads/?region=us-east-1&tab=overview#) for production in S3.

### Publish Release Notes

Write up release notes based on the PR to `master` (and the corresponding `mapper-annotated-scene` PR since that is where most of the action happens). Distribute the notes manually to whomever is interested.
