const jade = require('jade')

module.exports = function(content) {
	const template = jade.compile(content)
	this.cacheable()
	//noinspection NodeModulesDependencies
	return template({require,process})
}