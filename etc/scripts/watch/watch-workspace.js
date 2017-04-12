#!/usr/bin/env node
require('../init-scripts')
const
	watchman = require('fb-watchman'),
	client = new watchman.Client()

const
	path = require('path'),
	fs = require('fs'),
	_ = require('lodash')

function makeDepRoots(...depPairs) {
	return depPairs
		.map(pair => {
			pair[0] = path.resolve(__dirname,'../../../..',pair[0])
			pair[1] = path.resolve(__dirname,'../../../node_modules',pair[1])
			return pair
		})
		.filter(pair => test('-e',pair[0]))
	
}



const
	roots = makeDepRoots(
		["typestore/packages/typestore/dist","typestore/dist"],
		["typestore/packages/typestore-plugin-pouchdb/dist","typestore-plugin-pouchdb/dist"],
		["typestore/packages/typestore-mocks/dist","typestore-mocks/dist"],
		["typedux/dist","typedux/dist"],
		["material-ui/build","material-ui"],
		//["../typelogger/dist","typelogger/dist"],
		["typeguard/dist","typeguard/dist"],
		["typetransform/dist","typetransform/dist"]
	)

client.capabilityCheck({optional:[], required:[]},
	function (error, resp) {
		if (error) {
			console.log(error);
			client.end();
			return;
		}
		
	
		
		echo(`Verified Roots: ${JSON.stringify(roots,null,4)}`)
		
		function setupWatch(pair) {
			const
				[distPath,nodeModPath] = pair
			
			echo(`Setting up ${distPath}/${nodeModPath}`)
			
			
			// Initiate the watch
			client.command(['watch-project', distPath],
				function (error, resp) {
					if (error) {
						console.error('Error initiating watch:', error);
						return;
					}
					
					// It is considered to be best practice to show any 'warning' or
					// 'error' information to the user, as it may suggest steps
					// for remediation
					if ('warning' in resp) {
						console.log('warning: ', resp.warning);
					}
					
					// `watch-project` can consolidate the watch for your
					// dir_of_interest with another watch at a higher level in the
					// tree, so it is very important to record the `relative_path`
					// returned in resp
					
					console.log('watch established on ', resp.watch,
						' relative_path', resp.relative_path);
					
					subscribe(resp.watch,distPath,nodeModPath)
				});
		}
		
		function subscribe(watch,distPath,nodeModPath) {
			
				const
					sub = {
						// Match any `.js` file in the dir_of_interest
						expression: ["allof",
							["not",["match", `node_modules/**`, "wholename"]],
							["not",["match", `**/node_modules/**`, "wholename"]]
							//["match", `${distPath}/**/*.*`, "wholename"],
							//["not", "empty"]
						],
						// Which fields we're interested in
						fields: ["name", "size", "mtime_ms", "exists", "type"]
					};
				
				// if (relative_path) {
				// 	sub.relative_root = relative_path;
				// }
				
				const
					subName = `epic-dep ${distPath}`,
					doCopy = _.debounce(() => {
						console.log(`Copying ${distPath} to ${nodeModPath}`)
						cp('-R',distPath + '/*',nodeModPath)
					},500)
				
				client.command(['subscribe', distPath, subName, sub],
					function (error, resp) {
						if (error) {
							// Probably an error in the subscription criteria
							console.error('failed to subscribe: ', error);
							return;
						}
						console.log('subscription ' + resp.subscribe + ' established');
					});
				
				// Subscription results are emitted via the subscription event.
				// Note that this emits for all subscriptions.  If you have
				// subscriptions with different `fields` you will need to check
				// the subscription name and handle the differing data accordingly.
				// `resp`  looks like this in practice:
				//
				// { root: '/private/tmp/foo',
				//   subscription: 'mysubscription',
				//   files: [ { name: 'node_modules/fb-watchman/index.js',
				//       size: 4768,
				//       exists: true,
				//       type: 'f' } ] }
				client.on('subscription', function (resp) {
					if (resp.subscription !== subName)
						return;
					
					resp.files.forEach(function (file) {
						// convert Int64 instance to javascript integer
						const
							mtime_ms = +file.mtime_ms;
						
						console.log('file changed: ' + file.name, mtime_ms);
						
					});
					doCopy()
				});
			
		}
		
		roots.forEach(setupWatch)
	});
		
		



		
		


// roots.forEach(pair => {
//
// })

