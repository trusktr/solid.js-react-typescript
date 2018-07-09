/**
 * Recurse the actions/ directory and load all the modules
 */
export function loadActions() {

	// tslint:disable-next-line:no-any
  const context = (require as any).context("./actions", true, /\.ts$/)
  context.keys().forEach(context)
}
