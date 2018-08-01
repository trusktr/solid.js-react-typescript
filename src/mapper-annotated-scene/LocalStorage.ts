/**
 *  Copyright 2017 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

// Managed access to localStorage.
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
export default class LocalStorage {
	isAvailable: boolean
	private writeCache: Map<string, string> // blocks redundant writes to localStorage

	constructor() {
		this.isAvailable = LocalStorage.storageAvailable()
		this.writeCache = new Map()
	}

	setItem(key: string, value: string): void {
		if (this.isAvailable) {
			if (!this.writeCache.has(key) || this.writeCache.get(key) !== value) {
				this.writeCache.set(key, value)
				return localStorage.setItem(key, value)
			}
		} else {}
	}

	getItem(key: string, defaultValue: string | null = null): string | null {
		if (this.isAvailable) {
			const item = localStorage.getItem(key)

			if (item !== null) return item
			else return defaultValue
		} else { return null }
	}

	private static storageAvailable(): boolean {
		try {
			const x = '__storage_test__'

			localStorage.setItem(x, x)
			localStorage.removeItem(x)
			return true
		} catch (e) {
			return e instanceof DOMException && (
				// everything except Firefox
				e.code === 22 ||
				// Firefox
				e.code === 1014 ||
				// test name field too, because code might not be present
				// everything except Firefox
				e.name === 'QuotaExceededError' ||
				// Firefox
				e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
				// acknowledge QuotaExceededError only if there's something already stored
				localStorage.length !== 0
		}
	}
}
