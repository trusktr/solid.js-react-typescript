/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

/* eslint-disable typescript/no-explicit-any */

// export const typedConnect = SaffronSDK.ReactUtil.typedConnect
// export const Themed = SaffronSDK.Style.Themed
// export const FlexRow = SaffronSDK.Style.FlexRow
// export const FlexScale = SaffronSDK.Style.FlexScale
// export const PositionRelative = SaffronSDK.Style.PositionRelative
// export const FlexRowCenter = SaffronSDK.Style.FlexRowCenter
// export const FillWidth = SaffronSDK.Style.FillWidth
// export const FlexAlignCenter = SaffronSDK.Style.FlexAlignCenter
// export const mergeStyles = SaffronSDK.Style.mergeStyles

import * as SaffronSDK from '@mapperai/mapper-saffron-sdk'
import * as React from 'react'
import {connect} from 'react-redux'

export interface IThemedProperties extends SaffronSDK.Style.IThemedProperties { }
export interface IReactComponentConstructor<P, S> {
	new(props?: P, context?: any): React.Component<P, S>
}

/**
 * Typed support for Redux Connect using Selectors
 * @param selector
 * @returns {(target: IReactComponentConstructor<Props, State>) => void}
 */
export function typedConnect<Props, State>(selector: any): (target:IReactComponentConstructor<Props, State>) => void {
	// connect the selector to the react component (e.g., target)
	// this will allow the react component to get updated when the underlying store changes for state that it needs
	// by using connect and selectors it is more efficient then calling mapStateToProps
	return (target) => connect(selector, null, null, {withRef: true})(target as any) as any
}
