pipeline {
	agent any
	stages {
		stage('Build') {
			steps {
				sh '''./build-scripts/get-ecr-auth.sh'''
				sh '''./build-scripts/build.sh'''
				sh '''./build-scripts/hdk-push.sh'''
			}
		}
	}
	post {
		always {
			cleanWs(cleanWhenSuccess: true, cleanWhenUnstable: true, cleanWhenNotBuilt: true, cleanWhenAborted: true, deleteDirs: true, cleanWhenFailure: true)

		}

		failure {
			slackSend(channel: "#sw-build", color: 'D81A09', message: "Failed: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
		}

		unstable {
			slackSend(channel: "#sw-build", color: 'C1C104', message: "Unstable: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
		}

		changed {
			script {
				if (currentBuild.currentResult == 'SUCCESS') {
					// send to Slack
					slackSend (channel: "#sw-build", color: '25A553', message: "Success: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]. (${env.BUILD_URL})")
				}
			}


		}

	}
}
