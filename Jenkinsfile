@Library("mapper-jenkins-libs")_

node("master") {

	def branchName = env.BRANCH_NAME
	def saffronAppsS3Bucket = "mapper-saffron-apps"

	stage("Checkout") {
		checkout scm

	}

	// This is here to stop Jenkins from constantly rebuilding
	// (otherwise the Github updates that Jenkins creates would subsequently create a new Jenkins build, aka a cycle)
	if (ciSkip(action: 'should-skip')) {
		return
	}

	stage("Cleanup") {
		sh """
	rm -Rf ./build
	rm -Rf ./node_modules
	"""
	}

	stage("Prep and Build") {
		sh """
	npm install
	"""
	}

	/**
	 * ONLY MASTER OR DEVELOP BRANCHES
	 * zip repo and push to s3 bucket
	 *
	 */
	def pushToS3 = branchName == "feature/push-to-s3"

	if(pushToS3) {
		stage("Upload to S3") {
			versionBump()
			echo("ENV VERSION bumped to ${env.VERSION}")

			// zip repo and push to s3
			def zipFolderName = "mapper-annotator-${env.VERSION}.zip"
			sh """
      zip -r ${zipFolderName} .
      aws s3 cp ${zipFolderName} s3://${saffronAppsS3Bucket}/${zipFolderName}
      rm ${zipFolderName}
      github-release release -u signafy -r mapper-annotator  \
        --tag v${env.VERSION}   \
        --name "release ${env.VERSION}"
      """
		}
	}
}
