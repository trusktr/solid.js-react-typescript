require('./init-scripts')

const
	{process} = global,
	path = require('path'),
	fs = require('fs'),
	pkgPath = path.resolve(process.cwd(),'package.json'),
	semver = require('semver')

echo(`Updating patch version`)
function getPkg() {
	return require(pkgPath)
}


echo(`Updating version`)

function getVersion() {
	const
		pkg = getPkg()

	let
		{version} = pkg



	//fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2),'utf8')
	//execNoError(`git commit -a -m Patched && git tag v${newVersion} && git push --tags && git push`)

	return version


}

//execNoError(`npm version patch`)

const
	pkg = getPkg(),
	version = getVersion(),

	versionProps = `
EPICTASK_VERSION=${version}
EPICTASK_BUILD=${process.env.BUILD_NUMBER}
`

echo(`Using version: ${version}`)

fs.writeFileSync(
	'epictask-version.env',
	versionProps,
	'utf8'
)
