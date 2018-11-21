import {
	IAWSCredentials,
	makeS3PersistentServiceClientFactory,
	S3PersistentServiceClientFactory,
} from '@mapperai/mapper-annotated-scene'
import * as SaffronSDKType from '@mapperai/mapper-saffron-sdk'
import { isNumber } from 'lodash'
import getLogger from 'util/Logger'

// eslint-disable-next-line typescript/no-namespace
declare global {
	const SaffronSDK: typeof SaffronSDKType
}

const log = getLogger(__filename)

/**
 * Tile service client factory for meridian
 */
export function S3tileServiceClientFactoryFactory(
	organizationId: string,
	sessionId: string,
): S3PersistentServiceClientFactory {
	/**
	 * Holds the credentials that will be used
	 * to get tokens from S3
	 */
	let credentialPromise: Promise<IAWSCredentials | null> | null = null
	/**
	 * Session bucket name
	 */
	let sessionBucket: string

	/**
	 * Provide credentials promise
	 *
	 * @returns {Promise<IAWSCredentials>}
	 */
	async function credentialProvider(): Promise<IAWSCredentials | null> {
		if (credentialPromise) {
			const credentials = await credentialPromise

			if (
				credentials != null &&
				sessionBucket &&
				(!isNumber(credentials.expiration) ||
					credentials.expiration > Date.now())
			)
				return credentials
		}

		credentialPromise = (async () => {
			try {
				const response = (await new SaffronSDK.CloudService.default().makeAPIRequest(
					SaffronSDK.CloudConstants.API.Identity,
					SaffronSDK.CloudConstants.HttpMethod.GET,
					`identity/1/credentials/${sessionId}/annotator`,
					'annotator',
				)).get('data')

				// SET THE BUCKET
				sessionBucket = response.sessionBucket

				// ENSURE EXPIRATION
				const credentials = { ...response.credentials }

				if (!credentials.expiration)
					credentials.expiration = Date.now() + 1000 * 60 * 60 * 24

				return credentials as IAWSCredentials
			} catch (err) {
				log.error('Unable to get credentials', err)
				credentialPromise = null
				return null
			}
		})()

		return credentialPromise == null ? null : await credentialPromise
	}

	/**
	 * Provide bucket information
	 *
	 * @returns {string}
	 */
	function bucketProvider(_: string): string {
		return sessionBucket
	}

	return makeS3PersistentServiceClientFactory(
		credentialProvider,
		bucketProvider,
		organizationId,
		sessionId,
		null,
		false,
	)
}
