@Library("mapper-jenkins-libs")_

try {
  node('master') {

    stage("Checkout") {
      checkout scm
    }

		def branchName = env.BRANCH_NAME
    def tag = sh(returnStdout: true, script: "git tag --contains | head -1").trim()
    if (!tag) {
      throw new RuntimeException("skip")
    }

    stage("Assemble & Deploy App") {
      sh """
      rm -Rf ./dist
      rm -Rf ./node_modules
      npm install
      npm run package
      ARTIFACT=\$(find dist -name mapper-*.zip)
      FILENAME=\$(basename \${ARTIFACT})
      aws s3 cp \${ARTIFACT} s3://mapper-dev-saffron-apps/uploads/\${FILENAME}
      """
    }
  }
} catch (err) {
  def message = err.getMessage()
  if (message == "skip") {
    currentBuild.result = 'SUCCESS'
  } else {
    throw err
  }

}