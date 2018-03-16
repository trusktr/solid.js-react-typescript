# Configuration

## Where
Annotator configuration files live in [packages/config](../packages/config). They are consumed by [the index file](../packages/config/index.ts).

Default configuration is in [dev.yaml](../packages/config/dev.yaml). There could be a `prod.yaml` with distinct settings for production deployments, but we never made one.

For local testing, add configurations to [local.yaml](../packages/config/local.yaml). That file overrides the others and is not included in source control.

## How
In the application code each setting is loaded at run time with `config.get(<setting_name>)`.

If you are using [compile-watch.js](../etc/scripts/compile-watch.js) for development you probably noticed [react-hot-loader](https://www.npmjs.com/package/react-hot-loader) reloading the application code for you (with varying levels of success). The config directory is not visible to `react-hot-loader`, so restart the app to load config changes.

## What
The best way to find out what a setting does is to grep the project for its name. Documentation gets stale.
