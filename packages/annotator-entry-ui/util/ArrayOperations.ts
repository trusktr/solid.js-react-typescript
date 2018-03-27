/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import {AnnotationUuid} from 'annotator-entry-ui/annotations/AnnotationBase'

// remove duplicates
export function removeDuplicates(array: Array<AnnotationUuid>) {
	let a = array.concat()
	for (let i = 0; i < a.length; ++i) {
		for (let j = i + 1; j < a.length; ++j) {
			if (a[i] === a[j])
				a.splice(j--, 1)
		}
	}
	return a;
}
