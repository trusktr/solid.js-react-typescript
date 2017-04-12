
const
	{process} = global,

	{
		AWS_ACCESS_KEY_ID:accessKeyId,
		AWS_SECRET_ACCESS_KEY:secretAccessKey
	} = process.env


function loadAWS() {
	const
		AWS = require('aws-sdk')
		
	AWS.config.setPromisesDependency(require('bluebird'))
	AWS.config.update({
		accessKeyId,
		secretAccessKey,
		region: 'us-east-1'
	})
	
	return AWS
}
module.exports = accessKeyId && secretAccessKey ? loadAWS() : null
	