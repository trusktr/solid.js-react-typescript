let electronChild = null

const path = require('path')
const baseDir = path.resolve(__dirname,'..')
const nodemon = require('nodemon')
const child = require('child')

const {log} = global

export function startElectron() {
	if (!electronChild) {
		log.info('Starting electron')
		electronChild = child({
			command: `${baseDir}/node_modules/.bin/cross-env`,
			args: [`${baseDir}/node_modules/.bin/electron`,'--disable-http-cache','./dist/MainEntry.js'],
			options: {
				env: Object.assign({}, process.env, {
					HOT: '1',
					PATH: `${baseDir}/node_modules/.bin:${process.env.PATH}`
				})
			},
			autoRestart: false,
			cbClose(exitCode) {
				log.info(`Electron closed with ${exitCode}`)
			}
		})

		electronChild.start(() => {
			log.info(`Started Electron: ${code}`)
		})

	} else {
		// electronChild.restart((code) => {
		// 	log.info(`Restarted Electron: ${code}`)
		// },9)
	}
}
