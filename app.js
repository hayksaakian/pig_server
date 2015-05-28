var PORT = process.env.PORT || 4000;

if(process.env.NODE_ENV !== "production"){
  var dotenv = require('dotenv')
  dotenv.load()  
}

var fs = require('fs')
var app = require('express')();
var server = require('http').Server(app);
console.log('STARTED SOCKET.IO IMPORT')
var socketio = require('socket.io')
console.log('GOOD SOCKET.IO IMPORT')
var io = socketio(server);
var make_redis_client = require('./make_redis_client')
var session_client = make_redis_client(7)
var redis_client = make_redis_client(8)
var cookieParser = require('cookie-parser');
console.log('STARTED HANDSHAKE SOCKET.IO IMPORT')
var socketHandshake = require('socket.io-handshake');
console.log('GOOD HANDSHAKE SOCKET.IO IMPORT')

var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var sessionStore = new RedisStore({
  "client": session_client
})

// TODO: change settings if we want to handle secure cookies explicitly
// https://github.com/expressjs/session#cookie-options
// if (app.get('env') === 'production') {
//   app.set('trust proxy', 1) // trust first proxy
//   sess.cookie.secure = true // serve secure cookies
// }
var sessionSettings = {
  store: sessionStore,
  // cookie: { maxAge: 60000*60*24*30 }
  key: "sid",
  secret: process.env['SESSION_SECRET'],
  resave: false,
  saveUninitialized: false,
  parser: cookieParser()
}

// io.use(function(socket, next) {
//   sessionMiddleware(socket.request, socket.request.res, next);
// });
app.set('view engine', 'ejs');
app.use(session(sessionSettings));

io.use(socketHandshake(sessionSettings))

app.get('/', function (req, res) {
  if (!req.session.user) {
    console.log('New User! HTTP from:', req.ip)
    req.session.user = {
      id: guid(),
      created_at: (new Date).getTime()
    }
  }
  req.session.user.last_connect = (new Date).getTime()
  res.render('index', {
    user: req.session.user,
    port: PORT
  })
  // res.sendFile(__dirname + '/index.html');
});

var accounts = {};
var players_lfg = [];
var active_games = {};
//a game looks like this:

//to send data to a player do
//var a_socket = players["player_id"];
//a_socket.emit("some_key", "some_value");

io.on('connection', function (socket) {
  var session_user = socket.handshake.session.user 
    if (!session_user) {
      console.log('New User! websocket from:', socket.id)
      session_user = {
        id: guid(),
        created_at: (new Date).getTime()
      }
    }
    // console.log('old user:', session_user);
    session_user.last_connect = (new Date).getTime()
    session_user.socket_id = socket.id
  socket.handshake.session.user = session_user
  socket.handshake.session.save()
  console.log('socket connected! user:', socket.handshake.session.user);

  socket.on('herp', function(derp){
    socket.emit('derp', derp);
  });
  socket.emit('roomname', 'global chat')

  io.emit('status', io.sockets.sockets.length.toString()+' players online');

  if (socket.handshake.session.user['name']) {
    socket.emit('good_log_in', socket.handshake.session.user);
    pay_attention(socket)
  }else{
    socket.on('log_in', function(data){
      socket.handshake.session.user.name = data['name']
      socket.handshake.session.save()
      socket.emit('good_log_in', socket.handshake.session.user);
      pay_attention(socket)
    });
  }
  socket.on('send_message', function(data){
    // validate contents of message
    if(!data || !data['user'] || !data['message'] || !data['roomname']){
      console.log('malformed message', data)
      return
    }
    // validate target room
    if (!io.sockets.adapter.rooms[data['roomname']] || !io.sockets.adapter.rooms[data['roomname']][data['user']['socket_id']]) {
      console.log('malformed message', data)
      return
    }
    io.to(data['roomname']).emit('message', data)      
  })

  //tell everyone when this player disconnects
  socket.on('disconnect', function(){
    console.log('socket disconnected', socket.id)
    // socket.get('account', function (err, account) {
    //  //
    //  if(account != null){
    //    var name = account["name"];
    //    io.emit('message', name+' has disconnected');
    //    //TODO tell opponent and update game state to indicate d/c
    //  }
      io.emit('status', io.sockets.sockets.length.toString()+' players online');

    // });
  });
});

function syncMatchmakers () {
  io.emit('status', countMatchMaking()+" in matchmaking")
  var in_mm = Object.keys(io.sockets.adapter.rooms['matchmaking'])
  console.log(in_mm)
  var users = in_mm.map(function (socketId){
    return io.sockets.connected[socketId].handshake.session.user
  })
  console.log(users)
  io.to('matchmaking').emit('matchmaking_list', users)
}

function pay_attention(socket){
  io.emit('server_broadcast', socket.handshake.session.user["name"]+' connected!');
  // socket.join('matchmaking')
  // socket.on('new_ladder_game', function(data){
    //do something here, maybe create a persisted game
    //do match making
    socket.join('matchmaking')
    socket.emit('roomname', 'matchmaking')

    syncMatchmakers()

    if(!isMatchmaking){
      console.log("Queued on matchmaking server!")
      match_make();
    }
    socket.emit('new_ladder_game', 'starting search, lfg, socket: '+socket.id.toString());
    // io.sockets.socket(socket.id).emit('message', 'derp, socket finding works ');
    // io.sockets.socket(accounts[account["email"]]["socket_id"]).emit('message', 'derp, socket finding works from the variable too');
  // }); 
}
function S4() {
  return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}
function guid() {
  return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

var Game = function (player1, player2){
  this.player1 = player1
  this.player2 = player2
  this.totals = {}
  this.totals[this.player1.id] = 0
  this.totals[this.player2.id] = 0
  this.id = guid()
  this.active_player = player1
  this.results_this_turn = []

  active_games[this.id] = this
  // refactor this...
  // add_game_listeners_to_socket(player1["socket_id"], player2["socket_id"], 1);
  // add_game_listeners_to_socket(player2["socket_id"], player1["socket_id"], 2);
  // return g;
}

Game.prototype.sayHello = function() {
  console.log("Hello, I'm a game", this);
};

Game.prototype.emit = function(event_name, obj){
  return io.to('game:'+this.id).emit(event_name, obj)
}

Game.prototype.start = function(){
  //tell the first player to start
  this.emit('start_turn', this)
}

Game.prototype.set_listeners = function(socket_id, other_socket_id, no){

  socket = io.sockets.socket(socket_id);
  other_socket = io.sockets.socket(other_socket_id);

  socket.on('derp', function(derp){
    socket.emit('server_broadcast', derp);
  });
  socket.on('roll', function(game_id){
    // TODO: validate the socket sending the roll

    var game = validate_actionable(socket, 'roll', game_id)
    if(!game){
      return
    }

    game.roll()
  });
  socket.on('hold', function(game_id){
    var game = validate_actionable(socket, 'hold', game_id)
    if(!game){
      return
    }
    game.hold()
  });
}

var validate_actionable = function(socket, action, game_id) {
  var game = active_games[game_id]
  if(!game){
    console.error(socket.id, 'sent a ', action, ' to an inactive game')
    return false
  }

  if(socket.id != game.active_player.socket_id){
    console.error(socket.id, 'sent a ',action,', but its still', game.active_player.socket_id, "\'s turn")
    return false
  }

  return game
};

Game.prototype.between_turns = function(){
  this.results_this_turn = [];
  var total = this.totals[this.active_player.id];
  if(total >= 100){
    //set player won
    this.winner = active_player;
    this.emit('game_end', this);
    // move this over to another hash? out of active_games?
  }else{
    //no winner yet
    //tell the current player to start his t
    if(this.active_player.id == this.player1.id){
      this.active_player = this.player2
    }else{
      this.active_player = this.player1
    }
    this.emit('start_turn', this)
  }
}

Game.prototype.roll = function(){
  var roll_result = {};
  roll_result['game_id'] = this.id
  roll_result['roller'] = this.active_player.name;

  roll_result["first"] = Math.floor(Math.random()*5)+1;
  roll_result["second"] = Math.floor(Math.random()*5)+1;
  roll_result["roll_result"] = (roll_result["first"] + roll_result["second"]).toString();
  if(roll_result["first"] == 1 || roll_result["second"] == 1){
    roll_result["bust"] = true;
  }else{
    roll_result["bust"] = false;
  }

  game.last_roll = roll_result

  game.emit('roll_result', game);

  if(!roll_result["bust"]){
    game["results_this_turn"].push(roll_result["first"] + roll_result["second"]);
  } else {
    game.between_turns();
  }
}

Game.prototype.hold = function(){
  var total = this.turn_total();
  game.last_total = total
  game['totals'][game.active_player.id] += total;
  game.emit('hold_result', total);
  game.between_turns();
}

Game.prototype.turn_total = function(){
  var total = 0;
  this['results_this_turn'].forEach(function(r) {
    total += r;
  });
  return total;
}

var isMatchmaking = false;
var match_maker;

function getMatchMakingPlayers(){
  return Object.keys(io.sockets.adapter.rooms['matchmaking'] || {})
}

function countMatchMaking(){
  return getMatchMakingPlayers().length
}

function match_make(){
  isMatchmaking = true;
  //do matchmaking here maybe a loop over the players_lfg
  var players_lfg_length = countMatchMaking()
  console.log('players lfg atm: '+players_lfg_length.toString())
  if(players_lfg_length > 1){
    //note: splice returns an array 
    var all_matchmakers = getMatchMakingPlayers()
    player1_socket_id = all_matchmakers[0]
    player2_socket_id = all_matchmakers[1]

    var player1_socket = io.sockets.connected[player1_socket_id]
    var player1 = player1_socket.handshake.session.user

    var player2_socket = io.sockets.connected[player2_socket_id]    
    var player2 = player2_socket.handshake.session.user

    console.log('making a game with', player1, 'and', player2)
    var game = new Game(player1, player2);
    
    player1_socket.leave('matchmaking')
    player2_socket.leave('matchmaking')

    player1_socket.join('game:'+game.id)
    player2_socket.join('game:'+game.id)

    // console.log(player1);
    // console.log(player2);
    io.to('game:'+game.id).emit('create_game', game)

    io.to('game:'+game.id).emit('roomname', 'game:'+game.id)
    // io.to(player1["socket_id"]).emit('create_game', {"game_id":game['id'], "opponents_name":player2["name"]});
    // io.to(player2["socket_id"]).emit('create_game', {"game_id":game['id'], "opponents_name":player1["name"]});
    
    //socket1 socket2 game_id, starting_player
    game.start()
    // start(player1["socket_id"], player2["socket_id"], game['id'], "player1");
    if(countMatchMaking().length > 0){
      var cool_number = 200/players_lfg.length;
      if(cool_number < 2){
        cool_number = 2;
      }
      console.log('re-queueing matchmaking in', cool_number, 'ms')
      match_maker = setTimeout(match_make, cool_number);
    }else{
      isMatchmaking = false;
    }
  }else if(players_lfg_length == 1){
    console.log('stopping matchmaking', 'so alone DaFeels')
    isMatchmaking = false;
  }else{
    console.log('re-queueing matchmaking in', 200, 'ms')
    match_maker = setTimeout(match_make, 200);
  }
}

//kill matchmaking with 
//clearTimeout(match_maker);

server.listen(PORT);
