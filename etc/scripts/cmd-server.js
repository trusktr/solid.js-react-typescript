
const
	Hapi = require('hapi'),
	server = new Hapi.Server(),
	{spawn} = require('child_process'),
	stream = require('stream'),
	StringDecoder = require('string_decoder').StringDecoder,
	decoder = new StringDecoder('utf8')


server.connection({
	host: '0.0.0.0',
	port: 11221
})

server.route({
	method: 'GET',
	path: '/npm/package',
	handler: function (request,reply) {
		
		const
			res = outputStream = stream.Readable(),
		
			ex = spawn(
				`npm${process.platform === 'win32' ? '.cmd' : ''}`
				,['run','package']
			)
		
		// DUMBY READ FUNC
		res._read = function (size) {
		}
		
		// HANDLE LOG OUT
		ex.stdout.on('data',function(data) {
			const
				str = decoder.write(data)
			
			console.log(str)
			res.emit('data',str)
		})
		
		// HANDLE ERR OUT
		ex.stderr.on('data',function(data) {
			const
				str = decoder.write(data)
			
			console.error(str)
			res.emit('data',str)
		})
		
		// ON ERROR
		ex.on('error',(err) => {
			res.emit('error',err)
		})
		
		// ON END/CLOSE
		ex.on('close',(code) => {
			console.log(`Package exited ${code}`)
			
			if (code !== 0)
				res.emit('error',new Error(`Exited with code ${code}`))
			
			res.push(null)
		})
		
		reply(null,res)
	}
})

server.start((err) => {
	
	if (err) {
		throw err
	}
	console.log('Server running at:', server.info.uri)
})