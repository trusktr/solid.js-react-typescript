# annotated-scene

This is a library that renders an annotated scene, and has functions for
manipulating annotations.

An App can import this and, for example, add UI and keyboard/mouse listeners
that hook into this lib's annotation manipulation functions. Another app might
only care to render a scene, and not provide any UI for manipulation.

## install

```sh
npm install @mapperai/annotated-scene
```

## Use

In your React component:

```js
import * as React from 'react'
import AnnotatedSceneController from '@mapperai/mapper-annotated-scene/src/services/AnnotatedSceneController'
import {Events} from '@mapperai/mapper-annotated-scene/src/models/Events'

class MyComponent extends React.Component {
	constructor(props) {
		super(props)

		this.state = {
			sceneController: null,
		}
	}

	// set up a method to retrieve the instance
	getAnnotatedSceneRef = ref => {
		ref && this.setState({sceneController: ref.getWrappedInstance()})
	}

    render() {
        return (
			<AnnotatedSceneController
				ref={this.getAnnotatedSceneRef}
				backgroundColor={this.state.background}
				config={{
					// pass a config object

					// this one is required. It tells the scene what part of the world to initially show
					'startup.point_cloud_bounding_box': config['startup.point_cloud_bounding_box'],

					// other ones are optional (see src/DefaultConfig.ts)
					// ...
				}}
			/>
		)
    }

	componentDidUpdate(oldProps, oldState) {

		// wait until you have a reference to the controller:
		if (!oldState.sceneController && this.state.sceneController) {

			this.state.sceneController.channel.once(Events.ANNOTATED_SCENE_READY, () => {

				// ...do anything you want with the scene controller once it's
				// ready, like call API methods or set up event listeners...

				// for example put the camera somewhere.
				this.state.sceneController.setStage(30, 30, 30)

			})

		}

	}
}
```

## Dev

`npm link` the package into your project to dev with it.

You can `npm run typecheck && npm run lint` to verify code correctness.

## Build

This lib currently ships only TypeScript source files, so you're project will
have to build these files (f.e. in your Webpack, @babel/register, or TypeScript
build config).

If you'd like to add a build system to this package, please open a pull request.

At the moment the Annotator and Kiosk apps simply compile these files as part of
their build system. Have a look [over
there](https://github.com/Signafy/mapper-annotator) to get an idea of how those
apps do it.

### With Babel (Webpack)

If you're building a project with Babel (directly, or indirectly via Webpack,
not using the TypeScript compiler) the recommended Babel plugins that are known
to successfully compile this source code are:

```json
"devDependencies": {
	"@babel/core": "7.0.0-beta.51",
	"@babel/plugin-proposal-decorators": "7.0.0-beta.55",
	"@babel/plugin-proposal-object-rest-spread": "7.0.0-beta.55",
	"@babel/plugin-transform-modules-commonjs": "7.0.0-beta.51",
	"@babel/plugin-transform-react-jsx": "7.0.0-beta.51",
	"@babel/preset-typescript": "7.0.0-beta.51",
	"@babel/register": "7.0.0-beta.51",
	"babel-plugin-transform-class-properties": "6.24.1"
}
```

#### assets

If you're using Babel in Webpack, you'll need loaders for CSS, PNG, and OBJ files.

### With ts-node

For Node/Electron projects, you can set up a require hook for importing TypeScript files directly:

```js
require('ts-node').register({
	typeCheck: false,
	transpileOnly: true,
	files: true,
	ignore: [
		// ignore all node_modules except @mapperai/annotated-scene
		/node_modules(?!\/@mapperai\/annotated-scene)/,
	],
})
```

#### assets

You'll also need to import (require) CSS, PNG, and OBJ files. See for example
[Annotator's
require-hooks.js](https://github.com/Signafy/mapper-annotator/blob/91c9807cc3fd7fd52cb79a01c465bca10b7d267d/src/require-hooks.js)
for ideas of how to set it up.

## Tests

- [ ] Tests are TODO

## API

- [ ] API docs are TODO
