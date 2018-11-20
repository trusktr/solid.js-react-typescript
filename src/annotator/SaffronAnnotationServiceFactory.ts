import {
	IAWSCredentials,
	makeS3AnnotationServiceClientFactory,
	S3AnnotationServiceClientFactory,
} from '@mapperai/mapper-annotated-scene'
import * as SaffronSDKType from '@mapperai/mapper-saffron-sdk'

// eslint-disable-next-line typescript/no-namespace
declare global {
	const SaffronSDK: typeof SaffronSDKType
}

import { isNumber } from 'lodash'

/**
 * Annotation service client factory
 */
export function S3AnnotationServiceClientFactoryFactory(
	sessionId: string,
): S3AnnotationServiceClientFactory {
	/**
	 * Holds the credentials that will be used
	 * to write annotations to S3
	 */
	let credentialPromise: Promise<IAWSCredentials>
	/**
	 * Session bucket name
	 */
	let sessionBucket: string

	/**
	 * Provide credentials promise
	 *
	 * @returns {Promise<IAWSCredentials>}
	 */
	async function credentialProvider(): Promise<IAWSCredentials> {
		if (credentialPromise) {
			const credentials = await credentialPromise

			if (
				sessionBucket &&
				(!isNumber(credentials.expiration) ||
					credentials.expiration > Date.now())
			)
				return credentials
		}

		credentialPromise = new Promise<IAWSCredentials>(
			async (resolve, reject) => {
				try {
					const response = (await new SaffronSDK.CloudService.default().makeAPIRequest(
						SaffronSDK.CloudConstants.API.Identity,
						SaffronSDK.CloudConstants.HttpMethod.GET,
						`identity/1/writer/${sessionId}/credentials`,
						'annotator',
					)).get('data')

					// SET THE BUCKET
					sessionBucket = response.sessionBucket

					// ENSURE EXPIRATION
					const credentials = { ...response.credentials }

					if (!credentials.expiration)
						credentials.expiration = Date.now() + 1000 * 60 * 60 * 24

					resolve(credentials as IAWSCredentials)
				} catch (err) {
					reject(err)
				}
			},
		)

		return await credentialPromise
	}

	/**
	 * Provide bucket information
	 *
	 * @returns {string}
	 */
	function bucketProvider(_: string): string {
		return sessionBucket
	}

	return makeS3AnnotationServiceClientFactory(
		credentialProvider,
		bucketProvider,
		sessionId,
		new SaffronSDK.CloudService.default().makeAPIRequest,
	)
}
