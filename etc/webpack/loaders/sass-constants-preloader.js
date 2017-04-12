const loaderUtils = require("loader-utils"),
      fs          = require('fs'),
      path        = require("path")


module.exports = function (content) {
	const
		query = loaderUtils.parseQuery(this.query).path,
		queryString = JSON.stringify(query),
		varPath = queryString.replace(/["']/g, ''),
		contentPath = path.resolve(varPath)

	// Mark plugin as cache-able
	this.cacheable()

	// Add dependency
	this.addDependency(contentPath)





	function jsonToSassVars(obj, indent) {
		// Make object root properties into sass variables
		var sass = ""
		for (let key of Object.keys(obj)) {
			sass += "$" + key + ":" + JSON.stringify(obj[key], null, indent) + ";\n"
		}

		// Store string values (so they remain unaffected)
		var storedStrings = []
		sass = sass.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, function (str) {

			var id = "___JTS" + storedStrings.length
			storedStrings.push({id: id, value: str})
			return id
		})

		// Convert js lists and objects into sass lists and maps
		sass = sass.replace(/[{\[]/g, "(").replace(/[}\]]/g, ")")

		// Put string values back (now that we're done converting)
		storedStrings.forEach(function (str) {
			str.value = str.value.replace(/["']/g, '')
			sass = sass.replace(str.id, str.value)
		})

		return sass
	}


	// Parse the inbound json
	function loadContent() {
		return new Promise((resolve,reject) => {
			try {
				const ext = contentPath.split('.').pop()
				switch (ext) {
					case 'js':
						resolve(require(contentPath))
						break
					case 'json':
						fs.readFileSync(contentPath, 'utf8',(err,data) => {
							// Parse the json
							const obj = JSON.parse(data)
							resolve(obj)
						})
						break
					default:
						throw new Error('Can not load extension: ' + ext)
				}

			} catch (err) {
				console.error(`Failed to preload sass constants`,err)
				reject(err)
			}
		})


	}

	const callback = this.async()

	loadContent()
		.then((obj) => {
			const sass = jsonToSassVars(obj)
			//console.log('out sass = ',sass)
			callback(null,sass ? sass + '\n ' + content : content)
		})
		.catch(err => callback(err))

}