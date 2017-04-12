require('./init-scripts')


const
	AWS = require('./aws-init'),
	assert = require("assert"),
	_ = require('lodash'),
	semver = require('semver')

assert(AWS,`AWS was not loaded - check credentials`)

const
	s3 = new AWS.S3(),
	Bucket = 'epictask-releases'
	

async function getFileInfo(Key,filename) {
	
	const
		result = await s3.headObject({
			Bucket,
			Key
		}).promise(),
		{sum,size} = result.Metadata || {
			sum: "",
			size: `${result.ContentLength}`
		},
		path = require('path'),
		ext = path.extname(filename).substring(1),
		basename = filename.replace('.' + ext,''),
		versionRegEx = /(?:[0-9\.])+/g,
		// version = filename.match(/(?:[^-v][0-9\.])+/)
		version = versionRegEx.exec(basename),
		buildNumber = versionRegEx.exec(basename)
	
	
	
	return version && {
		sum,
		size,
		version: version[0],
		buildNumber: !buildNumber ? "0" : buildNumber[0],
		ext,
		platform: filename.split('-')[1],
		type: ['dmg','exe'].includes(ext) ? 'Installer' : _.upperFirst(ext)
	}
}

async function makeManifest() {
	
	const
		fileGroups = {}
	
	let
		nextPageToken = null
	
	while (true) {
		const
			result = await s3.listObjectsV2(_.assign({
				Bucket
			}, nextPageToken && {
				ContinuationToken: nextPageToken
			})).promise()
		
		nextPageToken =  result.ContinuationToken
		
		const
			{Contents} = result
		
		if (!Contents) {
			echo('Data is null')
			break
		}
		
		for (let s3Object of Contents) {
			const
				{Key,LastModified} = s3Object,
				parts = Key.split('/')
			
			echo(`Processing ${Key}`)
			if (parts.length !== 2) {
				echo(`${Key} has ${parts.length} path parts, can not handle`)
				continue
			}
			
			
			
			const
				filename = parts[1],
				fileGroup = fileGroups[parts[0]] || (fileGroups[parts[0]] = []),
				info = await getFileInfo(Key,filename)
			
			if (!info) {
				echo(`UNABLE TO GET INFO FOR ${filename}`)
				continue
			}
			
			fileGroup.push(_.assign(info,{
				filename:Key,
				timestamp:LastModified
			}))
			
		}
		
		if (!nextPageToken)
			break
	}
	
	
	
	const
		manifest = {}
	
	Object
		.keys(fileGroups)
		.forEach(groupName => {
			let
				version = null,
				versions = [],
				timestamp = null,
				platforms = {}
			
			const
				files = fileGroups[groupName]
			
			files.forEach(file => {
				if (!version || semver.gt(file.version,version)) {
					version = file.version
					timestamp = file.timestamp
				}
				
				if (!versions.includes(file.version))
					versions.push(file.version)
				
				const
					platform = platforms[file.platform] || (platforms[file.platform] = {}),
					platformVersionFiles = platform[file.version] || (platform[file.version] = [])
					
				platformVersionFiles.push(file)
				
				manifest[groupName] = {
					version,
					timestamp,
					versions,
					platforms
					
				}
			})
		})
	
	const
		manifestJson = JSON.stringify(manifest,null,4)
	
	echo(`Built manifest: \n${manifestJson}`)
	
	await s3.putObject({
		Bucket,
		Key: 'manifest.json',
		Body: manifestJson,
		ACL: 'public-read',
		ContentType: 'application/json'
	}).promise()
}

makeManifest()