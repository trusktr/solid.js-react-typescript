@Library("mapper-jenkins-libs")_

try {
  node('master') {
    properties([disableConcurrentBuilds()])

    String branchName

    // set up any variables here (with output inside here, otherwise the output
    // doesn't get shown on Jenkins, WTF)
    stage("Meta") {
      branchName = env.BRANCH_NAME

      // if we're in a pull request build
      if (branchName.startsWith("PR-")) {
        branchName = env.CHANGE_BRANCH
      }

      echo "Running build for branch: '${branchName}'"
    }

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
      sh """
        npm test
      """
    }

    // Detect if a tag is the second commit. We are only making merge commits to
    // develop or master when we merge a pull request, so if we're publishing a
    // release then the first commit will always be a merge commit, and the
    // second commit will be a commit tagged with a version number. If the
    // second commit is not tagged with a version number, then we consider this
    // to mean that we're not releasing.
    def secondToLastCommit = sh(returnStdout: true, script: "git log --oneline | sed -n 2p").trim()
    def tag = sh(returnStdout: true, script: "git --no-pager tag -l ${secondToLastCommit}").trim()

    // if we have a tag, we'll publish the new version
    if (tag) {
      echo "Found a tag: '${tag}'"

      /**
       * For Master and Develop create builds and push to s3
       */
      if (['master', 'develop'].contains(branchName)) {
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
      stage("Sync Hotfix Branch") {
        syncFromTo('master', 'hotfix')
      }

      stage("Sync Develop Branch") {
        syncFromTo('master', 'develop')
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

def syncFromTo(String sourceBranch, String targetBranch) {
  git branch: targetBranch, credentialsId: 'bd092093-19d1-4ed7-a4b9-4e2b24a3cc6f', url: 'git@github.com:Signafy/mapper-annotator.git'

  sh """
    git fetch --all
    git merge origin/${sourceBranch}
    git push --all
    git push --tags
  """
}
