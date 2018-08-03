/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

/* eslint-disable typescript/no-explicit-any, import/export */

// required by mapper-models/protobufjs
type Long = number

// allow TypeScript code to import JSON files. We could improve this by
// providing specific type definitions for different JSON files, like Saffron
// does.
//
// See https://hackernoon.com/import-json-into-typescript-8d465beded79
declare module '*.json' {
	const value: any
	export default value
}

declare module '*.scss' {
	const value: any
	export default value
}

declare module '*.css' {
	const value: any
	export default value
}
