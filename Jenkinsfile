@Library("mapper-jenkins-libs")_

try {
  node('master') {
    properties([disableConcurrentBuilds()])
    String branchName = env.BRANCH_NAME

    /**
     * Checkout
     */
    stage("Checkout") {
      checkout scm
    }

    /**
     * Cleanup
     */
    stage("Cleanup") {
      sh """
      rm -Rf ./dist
      rm -Rf ./node_modules
      """
    }

    /**
     * Install
     */
    stage("Install") {
      sh """
      npm i
      """
    }

    /**
     * Install
     */
    stage("Test") {
      echo "Running tests..."
      sh """
      npm test
      """
    }

    // Detect if a tag is the second commit (because we are only merging to
    // develop or master, so the first commit will always be a merge commit)
    def tag = sh(returnStdout: true, script: "git log --oneline | sed -n 5p").trim()
    def tagExists = sh(returnStdout: true, script: "git --no-pager tag -l $tag").trim()

    echo "Detected tag, if any: "
    echo tag

    // if we have a tag, we'll publish the new version
    if (tag) {

      /**
       * For Master and Develop create builds and push to s3
       */
      if(['master', 'develop'].contains(branchName)) {

        stage("Assemble & Deploy App") {
          // Environment Name
          def envName = branchName == "master" ? "prod" : "dev"

          echo "Publishing to: s3://mapper-${envName}-saffron-apps/uploads/\${FILENAME}"

          sh """
          npm run package
          ARTIFACT=\$(find dist -name mapper-*.zip)
          FILENAME=\$(basename \${ARTIFACT})
          aws s3 cp \${ARTIFACT} s3://mapper-${envName}-saffron-apps/uploads/\${FILENAME}
          """
        }
      }

    }

    /**
     * no matter which case, merge master into hotfix so they stay in sync
     */
    if (branchName == 'master') {
      stage("Get hotfix & merge new changes from master") {
        git branch: "hotfix", credentialsId: 'bd092093-19d1-4ed7-a4b9-4e2b24a3cc6f', url: 'git@github.com:Signafy/mapper-annotator.git'

        sh """
        git fetch --all
        git merge origin/master
        git push --all
        git push --tags
        """
      }
    }

    currentBuild.result = 'SUCCESS'
  }
} catch (err) {
  def message = err.getMessage()
  if (message == "skip") {
    currentBuild.result = 'SUCCESS'
  } else {
    throw err
  }
}
