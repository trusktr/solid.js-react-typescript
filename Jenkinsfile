@Library("mapper-jenkins-libs")_

// import ai.mapper.jenkins.*

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
      sh """
      npm test
      """
    }

    def tag = sh(returnStdout: true, script: "git tag --contains | head -1").trim()

    // if (!tag) {
    //   throw new RuntimeException("skip")
    // }

    // if we have a tag, we'll publish the nwe version
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

    } else {

      echo "Branch name: ${branchName}"

      // the assumption is we only merge pull requests into master
      def shouldBumpVersion = branchName == "develop"

      echo "Should bump dev version: ${shouldBumpVersion}"

      /**
       * Bump the version for develop and master
       * Saffron has two runs of the pipeline to push an update
       * The first run will bump the version number and push it to github
       * The second run does not need to bump the version again, and instead will use the updated version number (previously computed) to create a build
       * It takes two runs because the first time through the pipeline has a package.json file that hasn't been updated yet
       * (hence the first build is to solely increment the version)
       */
      if (shouldBumpVersion) {
        stage("Version bump: ${branchName}") {

          // BUMP VERSION
          // versionBumpV2(versionFilename: 'package.json')

          // runs a semver patch update on the version number in package.json
          sh """
          npm run publish-version-patch
          """
        }

        echo "Version bumped for ${branchName} branch. Next build will publish."
      }
    }

    /**
     * no matter which case, merge master into hotfix so they stay in sync
     */
    if (branchName == 'master') {
      stage("Get hotfix & merge new changes from master") {
        git branch: "hotfix", credentialsId: 'bd092093-19d1-4ed7-a4b9-4e2b24a3cc6f', url: 'git@github.com:Signafy/mapper-saffron.git'

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