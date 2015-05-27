var PORT = process.env.PORT || 4000;

if(process.env.NODE_ENV !== "production"){
  var dotenv = require('dotenv')
  dotenv.load()  
}

var fs = require('fs')
var app = require('express')();
var server = require('http').Server(app);
console.log('STARTED SOCKET.IO IMPORT')
var io = require('socket.io')(server);
console.log('GOOD SOCKET.IO IMPORT')
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
  socket.emit('roomname', 'lobby')

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
    console.log(data)
    if(data && data['user']){
      var msg = data['user']['name']+": "+data['message']
      console.log(msg)
      io.emit('message', msg)
    }
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
 
function pay_attention(socket){
  io.emit('message', socket.handshake.session.user["name"]+' connected!');
  // socket.join('matchmaking')
  // socket.on('new_ladder_game', function(data){
    //do something here, maybe create a persisted game
    //do match making
    socket.join('matchmaking')
    socket.emit('roomname', 'matchmaking')
    io.emit('status', countMatchMaking()+" in matchmaking")

    if(!isMatchmaking){
      console.log("Queued on matchmaking server!")
      // match_make();
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

function make_game(player1, player2){
  var g = {
    "player1":{"id":player1["email"], "total":0},
    "player2":{"id":player2["email"], "total":0},
    "id":guid(),
    "active_player":"player1",
    "results_this_turn":[]
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
  socket.on('derp', function(derp){
    socket.emit('message', derp);
  });
  socket.on('roll', function(game_id){
    //maybe check if this signal is coming from the active player
    //var the_roll = active_games[game_id]["roll"]();
    var the_roll = roll();
    the_roll['game_id'] = game_id;
    //remember to update ui client-side, updating things like results this turn where necessary
    the_roll['roller'] = true;
    the_roll['note1'] = 'you are the roller';
    socket.emit('roll', the_roll);
    socket.emit('message', the_roll);
    console.log('1st emit sent to roller ?='+(the_roll['roller'] == true).toString()+' at socket id: '+socket.id.toString());
    
    the_roll['roller'] = false;
    the_roll['note2'] = 'you are not the roller';
    other_socket.emit('roll', the_roll);
    console.log('2nd emit sent to roller ?='+(the_roll['roller'] == true).toString()+' at socket id: '+socket.id.toString());
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
    //tell the current player to start his t

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

function countMatchMaking(){
  return Object.keys(io.sockets.adapter.rooms['matchmaking'] || {}).length
}

function match_make(){
  isMatchmaking = true;
  //do matchmaking here maybe a loop over the players_lfg
  var players_lfg_length = countMatchMaking()
  console.log('players lfg atm: '+players_lfg_length.toString())
  if(players_lfg_length > 1){
    //note: splice returns an array 
    var player1 = players_lfg.splice(0, 1)[0];
    var player2 = players_lfg.splice(0, 1)[0];
    console.log(player1);
    console.log(player2);
    var game = make_game(player1, player2);
    // console.log(player1);
    // console.log(player2);
    io.sockets.socket(player1["socket_id"]).emit('create_game', {"game_id":game['id'], "opponents_name":player2["name"]});
    io.sockets.socket(player2["socket_id"]).emit('create_game', {"game_id":game['id'], "opponents_name":player1["name"]});
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

server.listen(PORT);
