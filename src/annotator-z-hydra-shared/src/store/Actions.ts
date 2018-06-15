/**
 * Recurse the actions/ directory and load all the modules
 */
export function loadActions() {
  const context = require.context("./actions", true, /\.ts$/)
  context.keys().forEach(context)
}
