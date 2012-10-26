var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs')

app.listen(8080);

function handler (req, res) {
  fs.readFile(__dirname + '/index.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }

    res.writeHead(200);
    res.end(data);
  });
}
var accounts = {};
var cur_players_count = 0;
var players_lfg = [];
var active_games = {};
//a game looks like this:

//to send data to a player do
//var a_socket = players["player_id"];
//a_socket.emit("some_key", "some_value");

io.sockets.on('connection', function (socket) {
	console.log('connection initiated!');
  cur_players_count = cur_players_count + 1;
  io.sockets.emit('status', cur_players_count.toString()+' players online');
  socket.on('log_in', function(data){
  	if(data['email']!= null && data['username'] != null && data['password'] != null){
	  	//data should be {"username":"some name, "email":"some email", "password":"somepass"}
	  	if(accounts[data["email"]] != null){
	  		//account exists
	  		var account = accounts[data["email"]];
	  		if(account["password"] == data["password"]){
	  			//account exists, and pw is good
	  			socket.emit('log_in', 'good');
					pay_attention(socket, account);
	  		}else{
	  			socket.emit('log_in', 'bad')
	  		}
	  	}else{
	  		//account does not exist, ask if should create it
				//persist the new account
				data['id'] = guid();
				socket.emit('message', 'new account created');
				socket.emit('log_in', 'good');
				accounts[data['email']] = data;
				pay_attention(socket, accounts[data["email"]]);
	  	}
	  }else{
	  	socket.emit('log_in', 'bad, missing fields');
	  }
	});
	//tell everyone when this player disconnects
	socket.on('disconnect', function(){
		socket.get('account', function (err, account) {
			//
			if(account != null){
				var name = account["username"];
				io.sockets.emit('message', name+' has disconnected');
			}
			cur_players_count = cur_players_count - 1;
		  io.sockets.emit('status', cur_players_count.toString()+' players online');

    });
	});
});
 
function pay_attention(socket, account){
	socket.set('account', account, function () {
		socket.emit('log_in', {'message':'good login', 'account':account["id"]});
		io.sockets.emit('message', account["username"]+' has connected!');
  });
	socket.on('new_ladder_game', function(data){
		//do something here, maybe create a persisted game
		//do match making
		accounts[account["email"]]["socket_id"] = socket.id;
		players_lfg.push(accounts[account["email"]]);
		if(!isMatchmaking){
			match_make();
		}
		socket.emit('new_ladder_game', 'starting search, lfg, socket: '+socket.id.toString());
		io.sockets.socket(socket.id).emit('message', 'derp, socket finding works ');
		io.sockets.socket(accounts[account["email"]]["socket_id"]).emit('message', 'derp, socket finding works from the variable too');
	});	
}
function S4() {
	return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}
function guid() {
	return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function make_game(player1, player2){
	var g = {
		"player1":{"id":player1["email"], "total":0},
		"player2":{"id":player2["email"], "total":0},
		"id":guid(),
		"active_player":"player1",
		"results_this_turn":[]//,
		// "get_active_player":get_active_player,
		// "get_other_player":get_other_player,
		// "start":start,
		// "roll":roll,
		// "hold":hold,
		// "between_turn":between_turn
	};
	add_game_listeners_to_socket(player1["socket_id"], player2["socket_id"], 1);
	add_game_listeners_to_socket(player2["socket_id"], player1["socket_id"], 2);
	return g;
}

function add_game_listeners_to_socket(socket_id, other_socket_id, no){
	socket = io.sockets.socket(socket_id);
	other_socket = io.sockets.socket(other_socket_id);
	//this var is never used, consider deleting
	socket.set('player_no', no);
	socket.on('roll', function(game_id){
		//maybe check if this signal is coming from the active player
		//var the_roll = active_games[game_id]["roll"]();
		var the_roll = roll();
		the_roll['game_id'] = game_id;
		//remember to update ui client-side, updating things like results this turn where necessary
		the_roll['roller'] = true;
		socket.emit('roll', the_roll);
		the_roll['roller'] = false;
		other_socket.emit('roll', the_roll);
		if(the_roll["bust"] == false){
	    active_games[game_id]["results_this_turn"].push(the_roll["first"] + the_roll["second"]);
    }else if(the_roll["bust"] == true){
			between_turn(socket, other_socket, game_id, no);
    }
	});
	socket.on('hold', function(game_id){
		var total = hold(game_id);
		active_games[game_id]["player"+no.toString()]["total"] += total;
		other_socket.emit('hold', game_id);
		between_turn(socket, other_socket, game_id, no);
	});
}

function between_turn(socket, other_socket, game_id, player_no){
	var active_player = 'player'+player_no.toString();
	active_games[game_id]['results_this_turn'] = [];
	var total = active_games[game_id][active_player]['total'];
	if(total >= 100){
    //set player won
    active_games[game_id]['winner'] = active_player;
    socket.emit('won', game_id);
    other_socket.emit('lost', game_id);

	}else{
    //no winner yet
    socket.emit('end_turn', game_id);
    other_socket.emit('start_turn', game_id);

    // isMyTurn = (isMyTurn == false);
    // if(isMyTurn){
    //   console.log('player\'s turn');
    //   $('#status').text('player\'s turn');
    //   take_player_turn();
    // }else{
    //   console.log("opponent\'s turn");
    //   $('#status').text('opponent\'s turn');
    //   take_ai_turn();
    // }
	}
}

function roll(){
  var retval = {};
  retval["first"] = Math.floor(Math.random()*5)+1;
  retval["second"] = Math.floor(Math.random()*5)+1;
  retval["roll_result"] = (retval["first"] + retval["second"]).toString();
  if(retval["first"] == 1 || retval["second"] == 1){
    retval["bust"] = true;
  }else{
    retval["bust"] = false;
  }
  return retval;
}

function hold(game_id){
  var total = turn_total(active_games[game_id]['results_this_turn']);
  return total;
}
function turn_total(a_turns_results){
  var total = 0;
  $.each(a_turns_results,function() {
      total += this;
  });
  return total;
}

function start(socket_id, other_socket_id, game_id, starting_player){
	//tell the first player to start
	io.sockets.socket(socket_id).emit('start_turn', game_id);
	io.sockets.socket(other_socket_id).emit('end_turn', game_id);
}

var isMatchmaking = false;
var match_maker;
function match_make(){
	isMatchmaking = true;
	//do matchmaking here maybe a loop over the players_lfg
	console.log('players lfg atm: '+players_lfg.length.toString())
	if(players_lfg.length > 1){
		//note: splice returns an array 
		var player1 = players_lfg.splice(0, 1)[0];
		var player2 = players_lfg.splice(0, 1)[0];
		var game = make_game(player1, player2);
		// console.log(player1);
		// console.log(player2);
		io.sockets.socket(player1["socket_id"]).emit('create_game', {"game_id":game['id'], "opponent_name":player2["username"]});
		io.sockets.socket(player2["socket_id"]).emit('create_game', {"game_id":game['id'], "opponent_name":player1["username"]});
		//socket1 socket2 game_id, starting_player
		active_games[game['id']] = game;
		start(player1["socket_id"], player2["socket_id"], game['id'], "player1");
		if(players_lfg.length > 0){
			var cool_number = 200/players_lfg.length;
			if(cool_number < 2){
				cool_number = 2;
			}
			match_maker = setTimeout(match_make, cool_number);
		}else{
			isMatchmaking = false;
		}
	}else{
		match_maker = setTimeout(match_make, 200);
	}
}

//kill matchmaking with 
//clearTimeout(match_maker);