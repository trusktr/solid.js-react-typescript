import {IAWSCredentials, makeS3TileServiceClientFactory} from "@mapperai/mapper-annotated-scene"
import * as SaffronSDKType from "@mapperai/mapper-saffron-sdk"

declare global {
	const SaffronSDK:typeof SaffronSDKType
}


import {isNumber} from 'lodash'


/**
 * Holds the credentials that will be used
 * to get tokens from S3
 */
let credentialPromise:Promise<IAWSCredentials>

/**
 * Session bucket name
 */
let sessionBucket:string

/**
 * Tile bucket name
 */
let tileBucket:string

/**
 * Provide credentials promise
 *
 * @returns {Promise<IAWSCredentials>}
 */
async function credentialProvider():Promise<IAWSCredentials> {
	if (credentialPromise) {
		const credentials = await credentialPromise
		if (sessionBucket && tileBucket && (!isNumber(credentials.expiration) || credentials.expiration > Date.now())) {
			return credentials
		}
	}
	
	credentialPromise = new Promise<IAWSCredentials>(async (resolve, reject) => {
		try {
			debugger
			const response = await new SaffronSDK.CloudService.default().makeAPIRequest(SaffronSDK.CloudConstants.API.Tiles, SaffronSDK.CloudConstants.HttpMethod.GET, "tiles/0/credentials", "annotator")
			
			// SET THE BUCKET
			sessionBucket = response.sessionBucket
			tileBucket = response.tileBucket
			
			// ENSURE EXPIRATION
			const credentials = {...response.credentials}
			if (!credentials.expiration) {
				credentials.expiration = Date.now() + (1000 * 60 * 60 * 24)
			}
			
			resolve(credentials as IAWSCredentials)
		} catch (err) {
			reject(err)
		}
		
	})
	
	return await credentialPromise
}

/**
 * Provide bucket information
 *
 * @returns {string}
 */
function bucketProvider(manifestSessionId:string):string {
	return manifestSessionId ? sessionBucket : tileBucket
}

/**
 * Tile service client factory for meridian
 *
 * @type {(scaleProvider: ScaleProvider, channel: EventEmitter, config: any) => S3TileServiceClient}
 */
export function S3TileServiceClientFactory(sessionId:string) {
	return makeS3TileServiceClientFactory(credentialProvider, bucketProvider, sessionId)
}
