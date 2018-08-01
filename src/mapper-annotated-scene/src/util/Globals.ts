/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import * as SaffronSDK from '@mapperai/mapper-saffron-sdk'

const rem = SaffronSDK.Style.rem
const Themed = SaffronSDK.Style.Themed

function installGlobals() {
	Object.assign(global, {
		rem: rem,
		Themed: Themed,
	})
}

installGlobals()

declare global {
	function rem(val: number): string
	function Themed<T>(styles: any): (BaseComponent: any) => any
}
