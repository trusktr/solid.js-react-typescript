#!/usr/bin/env node
const path = require('path')
const {exec} = require('child_process')
const SimpleGit = require('simple-git')
const p = process

// this should be one of 'patch', 'minor', 'major'
const versionBumpType = p.argv[2] // item 2 is the first CLI arg

async function main() {
  const git = SimpleGit(path.resolve(__dirname, '..'))

  const status = await run(git.status, git)()

  if (repoIsDirty(status)) {
    console.error('You have uncommitted or untracked files in the repo, please clear them and try again.')
    p.exit(1)
  }

  if (!['patch', 'minor', 'major'].includes(versionBumpType)) {
    console.error('You must specify one of "patch", "minor", or "major" as the first arg to this script.')
    p.exit(1)
  }

  // generate the new version into package.json, without committing or pushing
  await run(exec)(`npm --no-git-tag-version version ${versionBumpType}`)

  // grab the new version
  const {version} = require('../package.json')

  // undo the change
  await run(git.reset, git)('hard')

  const releaseBranch = `release/v${version}`

  // make a new branch with version in the name
  await run(git.checkoutLocalBranch, git)(releaseBranch)

  await run(exec)(`npm version ${versionBumpType} -m 'v%s'`)
  await run(git.push, git)('origin', releaseBranch)
  await run(git.pushTags, git)('origin')
}

main()

function run(callbackAPI, context = null) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      callbackAPI.call(context, ...args, (err, result) => (err ? reject(err) : resolve(result)))
    })
  }
}

function repoIsDirty(status) {
  // status.files contains modified or untracked files, staged or not.
  return status.files.length
}
