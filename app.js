var PORT = process.env.PORT || 8080;

if(process.env.NODE_ENV !== "production"){
  var dotenv = require('dotenv')
  dotenv.load()  
}
var fs = require('fs')
var app = require('express')();

var FileStreamRotator = require('file-stream-rotator')
var morgan = require('morgan')

var logDirectory = __dirname + '/log'

// ensure log directory exists
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory)

// create a rotating write stream
var accessLogStream = FileStreamRotator.getStream({
  filename: logDirectory + '/access-%DATE%.log',
  frequency: '24h',
  verbose: false, 
  date_format: "YYYY-MM-DD"
})

// setup the logger
app.use(morgan('combined', {stream: accessLogStream}))


var server = require('http').Server(app);
console.log('STARTED SOCKET.IO IMPORT')
var socketio = require('socket.io')
console.log('GOOD SOCKET.IO IMPORT')
var io = socketio(server);

var Promise = require('bluebird')
var Waterline = require('waterline')
var bodyParser = require('body-parser')
var methodOverride = require('method-override')

var orm = new Waterline();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride());

var redisAdapter = require('sails-redis')
var config = {
  adapters: {
    'default': redisAdapter,
    redis: redisAdapter
  },
  connections: {
    myRedis: {
      adapter: 'redis',
      database: 9
    }
  },
  defaults: {}
}

orm.loadCollection(require('./models/User'))
orm.loadCollection(require('./models/Game'))
orm.loadCollection(require('./models/Turn'))


var make_redis_client = require('./make_redis_client')
var session_client = make_redis_client(10)
// var redis_client = make_redis_client(8)
var cookieParser = require('cookie-parser');
console.log('STARTED HANDSHAKE SOCKET.IO IMPORT')
var socketHandshake = require('socket.io-handshake');
console.log('GOOD HANDSHAKE SOCKET.IO IMPORT')

var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var sessionStore = new RedisStore({
  "client": session_client,
  db: 10
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

// var User = function(){
//   this.id = guid()
//   this.created_at = (new Date).getTime()
//   this.wins = 0
//   this.losses = 0
// }

// User.unpack = function(raw_user){
//   var u = new User()
//   u.id = raw_user.id
//   u.name = raw_user.name
//   u.created_at = parseInt(raw_user.created_at, 10)
//   u.last_connect = parseInt(raw_user.last_connect, 10)
//   u.wins = parseInt(raw_user.wins, 10)
//   u.losses = parseInt(raw_user.losses, 10)
//   // u.socket_id = ???
//   return u
// }

app.get('/counter', function (req, res){
  console.log(req.session)
  if(!req.session.counter){
    req.session.counter = 0
  }
  req.session.counter = req.session.counter + 1
  req.session.save(function (err){
    res.status(200).json(req.session)  
  })
})

app.get('/', function (req, res) {
  var up = null
  console.log(req.session.user_id)
  if (req.session.user_id) {
    up = app.models.user.findOne({id: req.session.user_id})
  }else{
    console.log('New User! HTTP from:', req.ip)
    up = app.models.user.create({})
  }
  up.then(function (user){
    // console.log('found a user', user)
    return app.models.user.update({ id: user.id }, {
      last_ip: req.ip,
      last_connect: (new Date).getTime()
    });
  }).spread(function (user){
    // console.log('updated a user', user)
    req.session.user_id = user.id
    return new Promise(function (resolve, reject){
      req.session.save(function (err){
        // console.log('http session', req.session)
        if (err) {
          return reject(err)
        }
        resolve(user)
      })
    })
  }).catch(function (err){
    console.error('failed to save user', err)
    res.status(500).json({ err: err });      
  }).then(function (user){
    // console.log('sending user', user)
    res.render('index', {
      user: user,
      port: PORT
    })
  })
});

// TODO: make this a cache later on
// var active_games = {};
//a game looks like this:

//to send data to a player do
//var a_socket = players["player_id"];
//a_socket.emit("some_key", "some_value");

io.on('connection', function (socket) {
  // console.log(socket.id+' connected')
  socket.on('herp', function(derp){
    socket.emit('derp', derp);
  });
  // BUG PATCH
  // http://stackoverflow.com/questions/25830415/get-the-list-of-rooms-the-client-is-currently-in-on-disconnect-event
  // https://github.com/Automattic/socket.io/issues/1814
  socket.onclose = function(reason){
    //emit to rooms here
    //acceess socket.adapter.sids[socket.id] to get all rooms for the socket
    console.log(socket.adapter.sids[socket.id]);
    console.log('socket disconnected', socket.id)

    console.log('leaving:', socket.rooms)
    socket.rooms.forEach(function (roomname){
      if(socket.handshake.session.user_id){
        var user_id = socket.handshake.session.user_id      
        cleanup_potential_gameroom(roomname, user_id)
      }
    })
    Object.getPrototypeOf(this).onclose.call(this,reason);
  }

  // console.log('Socket Session', socket.handshake.session)
  var session_user_id = socket.handshake.session.user_id 
  var up = null
  if (session_user_id) {
    up = app.models.user.findOne({id: session_user_id})
  }else{
    console.log('New User! websocket from:', socket.id)
    up = app.models.user.create({})
  }
  up.then(function (user){
    // console.log('updating user in websocket', user)
    socket.handshake.session.user_id = user.id
    return new Promise(function (resolve, reject){
      socket.handshake.session.save(function (err){
        // console.log('saved sesson:', socket.handshake.session)
        if(err){
          return reject(err)
        }
        resolve(user)
      })      
    })
  }).then(function (user){
    // console.log('setting last_connect for', user)
    return app.models.user.update({id: user.id}, {
      // TODO: look up how to pull IP from socket
      // last_ip: req.ip,
      last_connect: (new Date).getTime()
    });
  }).spread(function (user){
    // console.log('socket connected! user:', user);
    console.log('socket connected!', 'user.name:',user.name, 'user.id:', user.id, 'socket_id:', socket.id);

    io.emit('status', io.sockets.sockets.length.toString()+' players online');

    if (user.name && user.name.length > 0) {
      console.log('good log in', user)
      socket.emit('good_log_in', user);
      io.emit('server_broadcast', user.name+' connected!');
      pay_attention(socket)
    }
    socket.on('log_in', function(data){
      app.models.user.update({
        id: socket.handshake.session.user_id
      }, {
        name: data['name']
      }).spread(function (user){
        socket.emit('good_log_in', user);
        io.emit('server_broadcast', user.name+' connected!');
        pay_attention(socket)
      }).catch(function (err){
        console.error(err)
        socket.disconnect()
      })
    });
    set_basic_listeners(socket)
  }).catch(function (err){
    console.error(err)
    socket.disconnect()
  })
});

function set_basic_listeners(socket){
  socket.on('send_message', function(data){
    // validate contents of message
    if(!data || !data['user'] || !data['message'] || !data['roomname']){
      console.log('malformed message', data)
      return
    }
    // validate target room
    if(data['roomname'] == "server-broadcast"){
      io.emit('message', data)
    }else if (socket.rooms.indexOf(data['roomname']) === -1 || !io.sockets.adapter.rooms[data['roomname']]) {
      console.log('malformed message, bad room', data)
      return
    }else{
      io.to(data['roomname']).emit('message', data)    
    }
  })

  //tell everyone when this player disconnects
  socket.on('disconnect', function(){
    
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
}

function syncMatchmakers () {
  io.emit('status', countMatchMaking()+" in matchmaking")
  var in_mm = Object.keys(io.sockets.adapter.rooms['matchmaking'] || {})
  console.log(in_mm)
  var user_ids = in_mm.map(function (socketId){
    return io.sockets.connected[socketId].handshake.session.user_id
  })
  app.models.user.find().where({
    id: user_ids
  }).then(function (users){
    console.log('in matchmaking:', users)
    io.to('matchmaking').emit('matchmaking_list', users)
  })
}

function pay_attention(socket){
  app.models.game.find().where({
    active: true,
    or: [{
      player1: socket.handshake.session.user_id,    
    }, {
      player2: socket.handshake.session.user_id,    
    }]
  }).populate('player1').populate('player2').populate('turns')
  .then(function (active_games){
    console.log(active_games.length)
    socket.emit('left_room', 'matchmaking')
    if(active_games.length > 0){
      active_games.forEach(function (game){
        game.reload(io)
        game.set_listeners(socket, validate_actionable)
      })
    }else{
      search_for_match(socket)
    }
  })

  // enable matchmaking
  socket.on('search_for_match', function(){
    search_for_match(socket)
  })

  // enable leaving rooms
  socket.on('leave_room', function (roomname){
    // TODO
    // consider the consequences of allowing 
    // any user to leave any room
    if(socket.handshake.session.user_id){
      var user_id = socket.handshake.session.user_id  
      cleanup_potential_gameroom(roomname, user_id)
    }
    socket.leave(roomname)
  })
}

function search_for_match(socket){
  socket.join('matchmaking')
  socket.emit('joined_room', 'matchmaking')

  syncMatchmakers()

  if(!isMatchmaking){
    console.log("Queued on matchmaking server!")
    match_make();
  }
}

function S4() {
  return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}
function guid() {
  return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

// var Game = function (player1, player2){
//   this.player1 = player1
//   this.player2 = player2
//   this.totals = {}
//   this.totals[player1.id] = 0
//   this.totals[player2.id] = 0
//   this.id = guid()
//   this.active_player_id = player1.id
//   this.results_this_turn = []
//   this.disconnects = []
//   this.active = true
//   // refactor this...
//   // add_game_listeners_to_socket(player1["socket_id"], player2["socket_id"], 1);
//   // add_game_listeners_to_socket(player2["socket_id"], player1["socket_id"], 2);
//   // return g;
// }

// Game.prototype.storable = function(){
//   return {
//     id: this.id,
//     player1: this.player1.id,
//     player2: this.player2.id,
//     totals_player1: this.totals[this.player1.id],
//     totals_player2: this.totals[this.player2.id],
//     active_player_id: this.active_player_id,
//     winner_id: (this.winner_id ? this.winner_id : ""),
//     loser_id: (this.loser_id ? this.loser_id : ""),
//     disconnects: this.disconnects.join(','),
//     last_socket: (this.last_socket ? this.last_socket : ""),
//     last_action: (this.last_action ? this.last_action : ""),
//     last_action_time: (this.last_action_time ? this.last_action_time : 0),
//   }
// }

// Game.unpack = function (game_obj){
//   app.models.user.findOne()
//   .where({id: game_obj.player1})
//   .then(function (player1){
//     var player2 = app.models.user.findOne()
//     .where({id: game_obj.player2}).then(function (player2){
//       return player2
//     })
//     return [player1, player2]
//   }).spread(function (player1, player2){
//     return new Promise(function (resolve, reject){
//       var g = new Game(player1, player2)
//       g.id = game_obj.id
//       g.totals[player1.id] = game_obj.totals_player1
//       g.totals[player2.id] = game_obj.totals_player2
//       g.active_player_id = game_obj.active_player_id
//       g.winner_id = game_obj.winner_id
//       g.loser_id = game_obj.loser_id
//       g.disconnects = game_obj.disconnects.split(',')
//       g.last_socket = game_obj.last_socket
//       g.last_action = game_obj.last_action
//       g.last_action_time = parseInt(game_obj.last_action_time, 10)
//       resolve(g)
//     })
//   })
// }

// Game.prototype.sayHello = function() {
//   console.log("Hello, I'm a game", this);
// };

// Game.prototype.emit = function(event_name, obj){
//   return io.to('game:'+this.id).emit(event_name, obj)
// }

// Game.prototype.start = function(){
//   //tell the first player to start
//   this.emit('start_turn', this)
// }

// Game.prototype.set_listeners = function(socket){
//   socket.on('derp', function(derp){
//     socket.emit('server_broadcast', derp);
//   });
//   ['roll', 'hold'].forEach(function (a_name){
//     socket.on(a_name, function(game_id){
//       console.log(socket.id, a_name+'ing for game:'+game_id)
//       validate_actionable(socket, a_name, game_id)
//       .then(function (game){
//         game[a_name]()
//       })
//     });
//   })
// }

var validate_actionable = function(socket, action, game_id) {
  console.log("looking for game:", game_id)
  return app.models.game.findOne({
    id: game_id,
    active: true
  }).populate('player1').populate('player2').populate('active_player').populate('turns', {sort: 'createdAt DESC'})
  .catch(function (err){
    console.error(err, socket.id, 'sent a', action, 'to an inactive game', game_id)
    if(game_id.length > 5){
      socket.emit('leave_room', game_id)
    }
  }).then(function (game){
    console.log("found game", game)
    return new Promise(function (resolve, reject){
      if(!game){
        console.error(err, socket.id, 'sent a', action, 'to an inactive game', game_id)
        if(game_id.length > 5){
          socket.emit('leave_room', game_id)
        }
        return reject(false)
      }

      // TODO make sure this socket_id 
      // is updated between disconnects
      var acting_user_id = socket.handshake.session.user_id
      if(acting_user_id != game.active_player){
        console.error(socket.id, 'user:', acting_user_id, 'sent a ', action,', but its still', game.active_player, "\'s turn")
        return reject(false)
      }

      // flood detection
      // milliseconds
      // this also "fixes" a bug that causes clients to emit
      // twice every time they send for some reason
      var RATE_LIMIT = 90
      if(game.last_player_id == acting_user_id && game.last_action == action){
        var new_time = (new Date).getTime()
        if(game.last_action_time > (new_time - RATE_LIMIT) ){
          console.error(socket.id, 'is flooding with', action, 'at', new_time)
          return reject(false)
        }else{
          console.log('action was long enough after to avoid rate limit')
        }
      }else{
        // console.log('new action, or socket, rate limit ignored')
      }

      game.last_player_id = socket.id
      game.last_action = action
      game.last_action_time = (new Date).getTime()
      resolve(game)
    }).then(function (game){
      return game.save()
    }).catch(function (err){
      console.error(err)
      return
    })
  })
};


function cleanup_potential_gameroom(roomname, leaver_id){
  if(roomname.substring(0, 5) !== 'game:'){
    return
  }
  console.log('cleaning up a done game here:', roomname)
  var game_id = roomname.substring(5)
  return app.models.game.findOne({
    id: game_id
  }).catch(function (err){
    console.error(err, "no game found with id:"+game_id)
  }).then(function (game){
    game.leaver(leaver_id)
  })
}

// Game.prototype.leaver = function(user_id) {
//   this.disconnects.push(user_id)
//   if(this.disconnects.length == 1){
//     // only 1 disconnect....
//     // TODO: give like 30 seconds to reconnect
//     // could use a setTimeout?
//     if(!this.winner_id || this.winner_id.length == 0){
//       if (this.player1.id == user_id) {
//         this.declare_winner(this.player2.id)
//       }else if(this.player2.id == user_id){
//         this.declare_winner(this.player1.id)
//       }
//     }
//   }else if(this.disconnects.length == 2){
//     this.active = false
//     this.save()
//   }
// }

// Game.prototype.save = function(){
//   redis_client.hmset("game:"+this.id, this.storable())  
// }

// Game.prototype.declare_winner = function(player_id) {
//   var self = this
//   return new Promise(function (resolve, reject){
//     redis_client.hgetall('user:'+player_id, function (err, returned){
//       if(err){
//         return reject(err)
//       }
//       resolve(User.unpack(returned))
//     })
//     // TODO: catch missing player
//   }).then(function (player){
//     //set player won
//     return new Promise(function (resolve, reject){
//       console.log('declaring', player, 'winner')

//       var winner = player;
//       var loser_id = self.player1.id == winner.id ? self.player2.id : self.player1.id
//       redis_client.hgetall('user:'+loser_id, function (err, returned){
//         if(err){
//           return reject(err)
//         }
//         resolve(winner, User.unpack(returned))
//       })
//     })
//     // TODO: catch missing loser
//   }).then(function (winner, loser){
//     self.winner_id = winner.id
//     self.loser_id = loser.id

//     winner.wins = 1 + (winner['wins'] ? winner.wins : 0)
//     loser.losses = 1 + (loser['losses'] ? loser.losses : 0)

//     console.log(winner.name, 'wins', loser.name, 'loses')
//     self.emit('game_end', self);
//     self.save()
//     redis_client.hmset('user:'+winner.id, winner, function (err, result){
//       if(err){
//         return console.error(err)
//       }
//     })
//     redis_client.hmset('user:'+loser.id, loser, function (err, result){
//       if(err){
//         return console.error(err)
//       }
//     })
//   })
// };

// Game.prototype.between_turns = function(){
//   this.results_this_turn = [];
//   var total = this.totals[this.active_player_id];
//   if(total >= 20){
//     this.declare_winner(this.active_player_id)
//     // move this over to another hash? out of active games?
//   }else{
//     //no winner yet
//     //tell the current player to start his t
//     if(this.active_player_id == this.player1.id){
//       this.active_player_id = this.player2.id
//     }else{
//       this.active_player_id = this.player1.id
//     }
//     this.emit('start_turn', this)
//     this.save()
//   }
// }

// Game.prototype.roll = function(){
//   var roll_result = {};
//   roll_result['game_id'] = this.id
//   roll_result['roller'] = this.active_player_id;

//   roll_result["first"] = 1 + Math.floor(Math.random() * 6);
//   roll_result["second"] = 1 + Math.floor(Math.random() * 6);
//   roll_result["roll_result"] = (roll_result["first"] + roll_result["second"]).toString();
//   if(roll_result["first"] == 1 || roll_result["second"] == 1){
//     roll_result["bust"] = true;
//   }else{
//     roll_result["bust"] = false;
//   }

//   console.log((new Date).getTime(), this.active_player_id, 'rolled', roll_result)

//   this.last_roll = roll_result

//   if(!roll_result["bust"]){
//     this["results_this_turn"].push(roll_result["first"] + roll_result["second"]);
//   }
//   this.last_total = this.turn_total()
//   this.emit('roll_result', this);

//   if(roll_result['bust']) {
//     this.between_turns();
//   }else{
//     this.save()
//   }
// }

// Game.prototype.hold = function(){
//   var total = this.turn_total();
//   this.last_total = total
//   this['totals'][this.active_player_id] += total;
//   this.emit('hold_result', this);
//   this.between_turns();
// }

// Game.prototype.turn_total = function(){
//   var total = 0;
//   this['results_this_turn'].forEach(function(r) {
//     total += r;
//   });
//   return total;
// }

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
    var player1_id = player1_socket.handshake.session.user_id

    var player2_socket = io.sockets.connected[player2_socket_id]    
    var player2_id = player2_socket.handshake.session.user_id

    console.log('making a game with', player1_id, 'and', player2_id)

    app.models.game.create({
      player1: player1_id,
      player2: player2_id,
      active_player: player1_id
    }).then(function (game){
      return app.models.game.findOne({id: game.id}).populate('player1').populate('player2').populate('active_player')
    }).then(function (game){
      console.log('made a game with', game.player1, 'and', game.player2)
      // var game = new Game(player1, player2);
      
      player1_socket.leave('matchmaking')
      player2_socket.leave('matchmaking')

      syncMatchmakers()

      player1_socket.join('game:'+game.id)
      player2_socket.join('game:'+game.id)

      game.start(io)
      game.set_listeners(player1_socket, validate_actionable)
      game.set_listeners(player2_socket, validate_actionable)
    }).finally(function () {
      // start(player1["socket_id"], player2["socket_id"], game['id'], "player1");
      players_lfg_length = countMatchMaking()
      if(players_lfg_length > 0){
        var cool_number = 200/players_lfg_length;
        if(cool_number < 2){
          cool_number = 2;
        }
        console.log('re-queueing matchmaking in', cool_number, 'ms')
        match_maker = setTimeout(match_make, cool_number);
      }else{
        isMatchmaking = false;
      }      
    })

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

orm.initialize(config, function (err, models) {
  if(err) throw err;

  app.models = models.collections;
  app.connections = models.connections;

  server.listen(PORT);

  console.log("To see saved users, visit http://localhost:"+PORT);
})
