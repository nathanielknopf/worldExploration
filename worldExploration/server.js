// first run
// sudo mongod --port 27017 --dbpath /data/db --config /usr/local/etc/mongod.conf

// to connect to mongo from terminal
// mongo --port 27017 -u "knopf" -p "cocosci" --authenticationDatabase "admin"
// to connect to mongo worldExploration db
// mongo --port 27017 -u "worldExploration" -p "worldExploration" --authenticationDatabase "worldExploration"

// db must have following collections
	// chains
	// data
	// language
	// training

var getTimestamp = function(){
	var date = moment().format().slice(0, 10)
	var time = moment().format().slice(11, 19)
	return date + ' ' + time
}

var express = require('express'),
 		app = express(),
 		fs = require('fs'),
 		vm = require('vm'),
 		moment = require('moment');

vm.runInThisContext(fs.readFileSync(__dirname + '/config.js'))
var nChains = configs.nChains

try {
	var
		 https = require('https'),
		 port = configs.https_port,
		 privateKey = fs.readFileSync(configs.private_key),
		 certificate = fs.readFileSync(configs.certificate),
		 credentials = {key: privateKey, cert: certificate},
		 server = https.createServer(credentials, app),
		 io = require('socket.io').listen(server);
} catch(err){
	console.log("HTTPS failed to launch -- falling back to HTTP")
	var
		 http = require('http'),
		 port = configs.http_port,
		 server = http.createServer(app),
		 io = require('socket.io').listen(server)
}

var mongodb = require('mongodb')
var MongoClient = mongodb.MongoClient
var url = configs.mongo_url
var db

MongoClient.connect(url, function(err, database){
	if(err){
		console.log("Error connecting to mongoDB server: ", err)
	}else{
		console.log("Connection established to", url)
		db = database
		server.listen(port)
		console.log("listening on port", port)
		var chain_collection = db.collection('chains')
		var data_collection = db.collection('data')
		var language_collection = db.collection('language')
		var training_collection = db.collection('training')
		
		app.use(express.static(__dirname));

		app.get(/^(.+)$/, function(req, res){
		     console.log('static file request : ' + req.params);
		     console.log("ACCESS: " + req.params[0])
		     res.sendFile(__dirname + req.params[0])
		 });

		var fnnsp = io.of('/function-nsp')

		//on connection, we assign the worker to a specific chain, and pass along any necessary data
		//the first generation of a chain receives no data
		fnnsp.on('connection', function(socket){
			console.log('connection')
			socket.emit('workerID request')
			var this_workerID;
			var started = false;
			var finished = false;
			socket.on('request data', function(workerID){
				this_workerID = workerID
				started = true
				console.log('workerID:', this_workerID)
				//we need to check if there's a chain with generation==0 and genInProgress==false
				//if such a chain exists (the root of a chain which was abandoned), then we 
				//assign this worker to that chain
				//if not, then we check the number of chains that have been assigned so far
				//if it's less than nChains, we assign to a new chain as necessary
				//if it's equal to nChains, then we assign the chain with minimum generation number
				chain_collection.find().sort({'gen':1}).toArray(function(err, results){
					//check if there's no results
					//if there are results, check if the first doc's gen is 0
					if(err){
						console.log('err', err)
					}else{
						if(results.length > 0){
							var min_gen_doc = results[0] //document of chain with minimum generation
							if(min_gen_doc.gen == 0){
								//assign to that chain
								var condition = min_gen_doc.condition
								var chain = min_gen_doc.chain
								var new_chain = {
									gen: 1,
									chain: chain,
									genInProgress: true,
									chainInProgress: true,
									workerID: this_workerID,
									condition: condition
								}
								chain_collection.insertOne(new_chain, function(err, res){
									if(err){
										console.log('err', err)
									}else{
										//delete min_gen_doc from the chains collection
										console.log('inserted into abandoned chain...')
										chain_collection.deleteOne(min_gen_doc, function(err, res){
											if(err){
												console.log('err', err)
											}else{
												console.log('deleted abandoned chain doc')
												socket.emit('assignment', {condition: condition, data: [], gen: 1, chain: chain})
											}
										})
									}
								})
							}else{
								//if we don't have the full number of chains yet, but there's no abandoned first generations
								if(results.length < nChains){
									//first half of chains are language
									if(results.length < nChains/2){
										var condition = 'language'
										var new_chain = {
											gen: 1,
											chain: results.length + 1,
											genInProgress: true,
											chainInProgress: true,
											workerID: workerID,
											condition: condition
										}
										chain_collection.insertOne(new_chain, function(err, res){
											if(err){
												console.log('err', err)
											}else{
												console.log('emitting data for new')
												socket.emit('assignment', {condition: condition, data: [], gen: 1, chain: results.length + 1})
											}
										})
									}else{
										//second half of chains are data_incidental
										var condition = 'data_incidental'
										var new_chain = {
											gen: 1,
											chain: results.length + 1,
											genInProgress: true,
											chainInProgress: true,
											workerID: workerID,
											condition: condition
										}
										chain_collection.insertOne(new_chain, function(err, res){
											if(err){
												console.log('err', err)
											}else{
												console.log('emitting data for two')
												socket.emit('assignment', {condition: condition, data: [], gen: 1, chain: results.length + 1})
											}
										})
									}
								}else{
									//we have nChains chains running already, so we must start assigning workers to existing chains
									var condition = min_gen_doc.condition
									var new_chain = {
										gen: min_gen_doc.gen + 1,
										chain: min_gen_doc.chain,
										genInProgress: true,
										chainInProgress: true,
										workerID: workerID,
										condition: condition
									}
									chain_collection.insertOne(new_chain, function(err, res){
										if(err){
											console.log('err', err)
										}else{
											console.log('inserted new chain into chains')
											if(condition == 'language'){
												//get the language data
												console.log('searching for language for chain', min_gen_doc.chain)
												console.log('gen', min_gen_doc.gen)
												language_collection.find({gen: min_gen_doc.gen, chain: min_gen_doc.chain}).toArray(function(err, results){
													if(err){
														console.log('err', err)
													}else{
														console.log('emitting data with language:', results[0].message)
														socket.emit('assignment', {condition: condition, data: results[0].message, gen: min_gen_doc.gen + 1, chain: min_gen_doc.chain})
														deleteMinGen(min_gen_doc)
													}
												})
											}else if(condition == 'data_incidental'){
												//get the incidental data
												data_collection.find({gen: min_gen_doc.gen, chain: min_gen_doc.chain}).toArray(function(err, results){
													if(err){
														console.log('err', err)
													}else{
														var data_to_send = results.map(function(this_doc){
															var x = this_doc.stimulus
															var y = this_doc.response
															return {x, y}
														})
														console.log('emitting %d data points to user', data_to_send.length)
														socket.emit('assignment', {condition: condition, data: data_to_send, gen: min_gen_doc.gen + 1, chain: min_gen_doc.chain})
														deleteMinGen(min_gen_doc)
													}
												})
											}
											var deleteMinGen = function(min_gen_doc){
												chain_collection.deleteOne(min_gen_doc, function(err, res){
													if(err){
														console.log('err', err)
													}else{
														console.log('deleted min_gen_doc (old chain document)')
													}
												})
											}
										}
									})
								}
							}
						}else{
							//very first worker
							var new_chain = {
								gen: 1,
								chain: 1,
								genInProgress: true,
								chainInProgress: true,
								workerID: workerID,
								condition: 'language'
							}
							chain_collection.insertOne(new_chain, function(err, res){
								if(err){
									console.log('err', err)
								}else{
									console.log('emitting data for first user')
									socket.emit('assignment', {condition: 'language', data: [], gen: 1, chain: 1})
								}
							})
						}
					}
				})
			})			

			//receive and store data from the training rounds
			socket.on('training', function(training_data){
				console.log('received data')
				var new_training_doc = {
					gen: training_data.gen,
					chain: training_data.chain,
					stimulus: training_data.stimulus,
					response: training_data.response,
					workerID: training_data.workerID,
					condition: training_data.condition
				}
				training_collection.insertOne(new_training_doc, function(err, results){
					if(err){
						console.log('err', err)
					}else{
						console.log('stored training trial from worker:', training_data.workerID)
					}
				})
			})

			//receive and store data from the testing rounds
			socket.on('data', function(trial_data){
				console.log('received data')
				var new_data_doc = {
					gen: trial_data.gen,
					chain: trial_data.chain,
					stimulus: trial_data.stimulus,
					response: trial_data.response,
					workerID: trial_data.workerID,
					condition: trial_data.condition
				}
				data_collection.insertOne(new_data_doc, function(err, results){
					if(err){
						console.log('err', err)
					}else{
						console.log('stored test trial from worker:', trial_data.workerID)
					}
				})
			})

			//receive and store language provided during debrief
			socket.on('language', function(language_data){
				var new_language_doc = {
					gen: language_data.gen,
					chain: language_data.chain,
					message: language_data.message,
					workerID: language_data.workerId
				}
				language_collection.insertOne(new_language_doc, function(err, results){
					if(err){
						console.log('err', err)
					}else{
						console.log('inserted language doc from worker:', language_data.workerID)
						console.log('message:', language_data.message)
					}
				})
			})

			//receive when a worker completes their experiment - we can set the genInProgress var for their chain to false
			socket.on('complete', function(workerID){
				finished = true;
				chain_collection.update({workerID: workerID}, {$set: {genInProgress: false}}, function(err, numChanged){
					if(err){
						console.log("error updating chain collection doc", err)
					}else{
						console.log("Changed %d doc(s)...", numChanged)
					}
				})
			})

			socket.on('disconnect', function(){
				//delete the relevant documents from this user if they started the experiment but did not finish it
				if(started && !finished){
					console.log('searching for:', this_workerID)
					chain_collection.find({workerID: this_workerID}).toArray(function(err, results){
						if(err){
							console.log('err', err)
						}else{
							console.log("results")
							console.log(results)
							worker_doc = results[0]
							console.log('worker_doc:')
							console.log(worker_doc)
							if(worker_doc.genInProgress){
								if(worker_doc.condition == 'language'){
									language_collection.deleteMany({workerID: this_workerID}, function(err, results){
										if(err){
											console.log('err', err)
										}
									})
								}
								data_collection.deleteMany({workerID: this_workerID}, function(err, results){
									if(err){
										console.log('err', err)
									}else{
										console.log('unexpected disconnection, deleted trial data from worker')
									}
								})
								training_collection.deleteMany({workerID: this_workerID}, function(err, results){
									if(err){
										console.log('err', err)
									}else{
										console.log('unexpected disconnection, deleted training data from worker')
									}
								})
								chain_collection.deleteOne(worker_doc, function(err, results){
									if(err){
										console.log('err')
									}else{
										console.log('unexpected disconnection, deleted chain info from worker')
									}
								})
								var temp_chain = {
									gen: worker_doc.gen - 1,
									chain: worker_doc.chain,
									genInProgress: false,
									chainInProgress: true,
									workerID: 'temp',
									condition: worker_doc.condition
								}
								chain_collection.insertOne(temp_chain, function(err, results){
									if(err){
										console.log('err', err)
									}else{
										console.log('inserted temp')
									}
								})
							}
						}
					})
				}
			})
		})
	}
})