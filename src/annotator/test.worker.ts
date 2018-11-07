console.log('worker!!!!', self)

import * as _ from 'lodash'
// import _ = require('lodash')
// const _ = require('lodash')

async function sleep(duration: number): Promise<void> {
	return new Promise<void>(resolve => {
		setTimeout(resolve, duration)
	})
}

~(async function main() {
	while (true) {
		console.log('lodash map exists:', !!_.map)
		await sleep(1000)
	}
})()

// The rest is a hack, required for types to work in any file that imports this worker.
//
// We use `any` in the following to trick TypeScript, so we can ensure that
// `class extends Worker` will not fail if Worker is otherwise undefined.
/* eslint-disable typescript/no-explicit-any */
if (typeof (global as any).Worker === 'undefined')
	(global as any).Worker = class {}

export default class extends Worker {
	constructor() {
		super('')
	}
}
