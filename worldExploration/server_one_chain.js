// first run
// sudo mongod --port 27017 --dbpath /data/db --config /usr/local/etc/mongod.conf

// to connect to mongo from terminal
// mongo --port 27017 -u "knopf" -p "cocosci" --authenticationDatabase "admin"
// to connect to mongo worldExploration db
// mongo --port 27017 -u "worldExploration" -p "worldExploration" --authenticationDatabase "worldExploration"

// db must have following collections
	// survey_responses
	// data
	// language
	// workers
	// comprehension

// flow of experiment
	// turker connects to experiment.html - we send them some prerequisite data (or not if first gen)
	// turker is redirected to game.html - plays game, we collect data
	// turker is redirected to survey.html - asked questions, we store responses
	// turker is redirected to comprehension.html - given a set of comprehension questions, we store success/failure
	// turker is redirected to exitsurvey.html - we store response
	// turker disconnects - we post a new hit to recruit the next generation.

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
		console.log("Error connecting to mongodb server:", err);
	}else{
		console.log("Connection established to", url);
		db = database;
		server.listen(port);
		console.log("This server now listening on port", port);

		// grab collections
		var data_collection = db.collection('data');
		var language_collection = db.collection('language');
		var workers_collection = db.collection('workers');
		var survey_collection = db.collection('survey_responses');
		var comp_collection = db.collection('comprehension')

		app.use(express.static(__dirname));

		// send requested documents (usually images for the game)
		app.get(/^(.+)$/, function(req, res){
			// for debugging
			console.log('REQ:', req.params)
			console.log('ACCESS:', req.params[0])
			// send requested file
			res.sendFile(__dirname + req.params[0])
		});

		// exp_nsp flow:
		// client connects - server requests workerID
		// when client responds with workerID, gather beginning data for them (i.e. language from
		// past generation) and send along with approval (or in case of failure, disapproval) to
		// begin the experiment
		var exp_nsp = io.of('/exp-nsp');
		exp_nsp.on('connection', function(socket){
			// on connection - if not first in chain, pass along data. if first, don't pass anything
			console.log("Connection to exp_nsp");
			socket.emit('workerID request') // request workerID for storing in database
			var this_workerID;
			// not sure what these are for
			socket.on('request data', function(packet){
				var this_workerID = packet.workerID;
				console.log("Worker", workerID, "will soon begin experiment.");
				// insert worker into workers collection, and send beginning data
				workers_collection.stats(function(err, stats){
					// figure out what gen the worker is
					var gen = stats['count'] // hacky, but should get the job done
					var new_worker_data = {
						workerID: this_workerID,
						generation: gen
					}
					// insert them into the workers colelction
					workers_collection.insert(new_worker_data, function(err, results){
						if(err){
							console.log("Error adding new worker to db", err);
							// if this fails, send something to the client so they can bail
							socket.emit('beginning data', {success: false, message: [null]})
						}else{
							console.log("Inserted worker", this_workerID, "into db.");
							// once the worker has been submitted, we  send the appropriate data and
							// clear the turker to continue with the experiment.
							if gen == 0:
								socket.emit('beginning data', {success: true, message: [null]});
							else:
								// gather most recent data from language collection, then emit
								language_collection.find().sort({"gen": -1}).toArray(function(err, results){
									if(err){
										console.log("Failed to query language data:", err);
										socket.emit('beginning data', {success: false, message: [null]})
									}else{
										var most_recent_entry = results[0];
										var language = most_recent_entry["language"];
										// send the data along
										socket.emit('beginning data', {success: true, message: [language]});
									}
								})
						}
					})
				})
			})
		});

		// game_nsp flow:
		// client connects - send request for data. when data received, begin game:
			// server starts a timer and emits the time every second
			// when timer hits zero, send redirect to the survey
			// meanwhile, server can accept updates from the game regarding actions, scores
		var game_nsp = io.of('/game-nsp');
		game_nsp.on('connection', function(socket){

			socket.emit('data request')

			socket.on('request data', function(data){
				var workerID = data.workerID;
				timer(configs.play_time);
				socket.emit('begin game');

				socket.on('action', function(data){
					console.log("Received data from", workerID);

					// what sorts of data do we receive?
						// acts: [thrown, grabbed, shot, shot_empty] (note action is a keyword)
						// obj (action is done upon): [rock, fruits, animals, aquatic creaters] (note object is a keyword)
						// score (after action performed): int
						// timer (value at action): int (range 0-60)
					var data_doc = {
						workerID: workerID,
						act: data.act,
						obj: data.obj,
						score: data.score,
						time: data.timer
					}

					data_collection.insert(data_doc, function(err, results){
						if(err){
							console.log("Error inserting data:", err);
						}else{
							console.log("Inserted data from", workerID, "at timer =", data.timer);
						}
					})
				})
			})

			var timer = function(seconds){
				setTimeout(function(){
					if (seconds > 0){
						socket.emit('timer', seconds-1);
						timer(seconds-1);
					}else{
						// redirect when timer expires
						socket.emit('redirect', '/survey.html');
						console.log("Redirecting", workerID, "to survey.")
					}
				})
			}
		});

		// survey_nsp flow:
		// receive answers to questions from client
		var survey_nsp = io.of('/survey-nsp');
		survey_nsp.on('connection', function(socket){
			socket.on('response', function(response_packet){
				// format of response packet:
					// workerID: workerID
					// gen: generation of turker
					// question: copy of question text
					// response: response to question
				var response_doc = {
					workerID: response_packet.workerID,
					question: response_packet.question,
					response: response_packet.response
				};
				survey_collection.insert(response_doc, function(err, results){
					if(err){
						console.log("Error storing survey results:", err);
					}else{
						console.log("Stored response to survey question from worker", response_packet.workerID);
					}
				});
			})
		});

		// comp_nsp flow:
		// client connects - we wait for a request for a task, then send the first task
		// then, as we receive actions we store the results and send the next task
		// once they've finished the tasks (actions received and no tasks remain) we redirect them to thanks.html
		var comp_nsp = io.of('/comp-nsp');
		comp_nsp.on('connection', function(socket){
			var tasks = configs.comp_tasks; // list of comprehension tasks
			var task_ind = 0; // index of current task in the list
			socket.on('request', function(packet){
				// on a request for a task, send tasks[task_ind] and increment task_ind
				if (task_ind < tasks.length){
					socket.emit('task', {task: tasks[task_ind]});
					tasks_ind += 1;
				}else{
					socket.emit('redirect', '/exit.html');
				};
			})

			socket.on('action', function(action_packet){
				// what sorts of data do we receive?
					// workerID: MTurk worker ID
					// task: what the current task is
					// act: [thrown, grabbed, shot, shot_empty] (note action is a keyword)
					// obj (action is done upon): [rock, fruits, animals, aquatic creaters] (note object is a keyword)
					// correct: bool (whether or not the correct task was performed)
					// gave_up: bool (whether or not the turker gave up on the task)
				var workerID = action_packet.workerID;
				var comp_doc = {
					workerID: workerID,
					task: action_packet.task,
					act: action_packet.act,
					obj: action_packet.obj,
					correct: action_packet.correct,
					gave_up: action_packet.gave_up
				};
				comp_collection.insert(comp_doc, function(err, results){
					if(err){
						console.log("Error inserting comprehension results:", err);
					}else{
						console.log("Successfully inserted result of comprehension task.")
						console.log("Waiting for request for new task")
					};
				});
			});
		});

		// exit_nsp flow:
		// client connects - mturk handles the rest, and we can now post another HIT.
		var exit_nsp = io.of('/exit-nsp');
		exit_nsp.on('connection', function(socket){
			// post a new HIT!
			console.log("Clear to post a new HIT.");
		})
	};
});
