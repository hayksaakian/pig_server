var Waterline = require('waterline')
var Promise = require('bluebird')

var Pig = require('./Pig')
var Gwent = require('./Gwent')

var RULES = {
  'Pig': Pig,
  'Gwent': Gwent
}

// figure out how to require this properly
var Game = Waterline.Collection.extend({

  identity: 'game',
  connection: 'myRedis',

  attributes: {
    kind: {
      type: 'string',
      enum: ['Pig', 'Gwent']
    },

    created_at: {
      type: 'integer',
      defaultsTo: 0
    },

    
    totals_player1: {
      type: 'integer',
      defaultsTo: 0
    },
    totals_player2: {
      type: 'integer',
      defaultsTo: 0
    },
    
    active: {
      type: 'boolean',
      defaultsTo: true,
      index: true
    },

    // players: {
    //   collection: 'user',
    //   via: 'games'
    // },

    player1: {
      model: 'user',
      via: 'games_hosted'
    },

    player2: {
      model: 'user',
      via: 'games_joined'
    },

    winner: {
      model: 'user',
      via: 'games_won'
    },

    loser: {
      model: 'user',
      via: 'games_lost'
    },

    active_player: {
      model: 'user',
      via: 'games_active'
    },

    last_connect: 'integer',
    last_player_id: 'string',
    last_action: 'string',
    last_action_time: 'integer',

    turns: {
      collection: 'turn',
      via: 'game'
    },

    disconnects: {
      type: 'array',
      defaultsTo: []
    },

    emit: function(io, event_name, obj){
      return io.to('game:'+this.id).emit(event_name, obj)
    },

    start: function(io){
      io.models.turn.create({
        game: this.id,
        roller: this.active_player
      }).then(function (turn){
        return io.models.game.refetch(turn.game)
      }).then(function (game){
        game.emit(io, 'create_game', game)
        game.emit(io, 'joined_room', 'game:'+game.id)
        game.emit(io, 'left_room', 'matchmaking')
        game.emit(io, 'start_turn', game)
      })
    },

    reload: function(io){
      // ensure there's at least 1 turn
      io.models.game.refetch(this.id)
      .then(function (game){
        return new Promise(function (resolve, reject){
          // thes could be moved to a 
          // ruleset.initialize
          // or something
          if(game.turns && game.turns.length > 0){
            resolve(game)
          }else{
            io.models.turn.create({
              game: game.id,
              roller: game.active_player
            }).then(function (turn){
              return io.models.game.refetch(turn.game)
            }).then(function (game){
              resolve(game)
            })
          }
        })
      }).then(function (game){
        console.log('reloading game! game:', game.id)
        game.emit(io, 'reload_game', game)   
        game.emit(io, 'joined_room', 'game:'+game.id)
        game.emit(io, 'start_turn', game)
      })
    },

    act: function(io, action, game_id)  {
      io.models.game.refetch(game_id)
      .then(function (game) {
        var ruleset = RULES[game.kind]
        ruleset[action](io, game)
      })
    },

    //  Rule set specific
    ///////////////////////////

    
    // non rule set specific
    ///////////////////////////
    

    declare_winner: function(io, winner_id){
      io.models.game.refetch(this.id)
      .then(function (game){
        var loser_id = null
        var winner = null
        var loser = null

        if(game.player1.id == winner_id){
          winner = game.player1
          loser_id = game.player2.id
          loser = game.player2
        }else{
          winner = game.player2
          loser_id = game.player1.id
          loser = game.player1
        }

        winner.wins = winner.wins + 1
        loser.losses = loser.losses + 1

        game.winner = winner_id
        game.loser = loser_id
        game.active = false

        // TODO: this needs testing
        return [game.save(), winner.save(), loser.save()]
      }).spread(function (game, winner, loser){
        console.log(winner.name, 'wins', loser.name, 'loses')
        // TODO: do we need to populate anything?
        io.emit('game_end', game)

        io.models.user.leaderboard(io).then(function (leaders){
          io.emit('leaderboard', leaders)
        })
      })
    },

    leaver: function(user_id){
      if(!this.disconnects){
        this.disconnects = []
      }

      if(this.disconnects.indexOf(user_id) !== -1){
        this.disconnects.push(user_id)      
      }
      if(this.disconnects.length == 2){
        this.active = false
        this.save()
      }
    },
  },
  // // 'class' methods
  // assemble: function(player1_id, player2_id){
  // },
  refetch: function (game_id) {
    return this.findOne({id: game_id})
          .populate('player1').populate('player2')
          .populate('turns', {sort: 'createdAt DESC'})
  },

  set_listeners: function(game_id, io, socket){
    socket.on('game:'+game_id, function (action){
      console.log("-------------------------------")

      console.log('user:', socket.handshake.session.user_id, 'socket:', socket.id, action+'ing for game:'+game_id)
      io.models.game.validate_actionable(io, socket, action, game_id)
      .then(function (game){
        if(game){
          game.act(io, action, game.id)            
        }else{
          console.log('no valid way to', action, 'for game:', game_id)
        }
      })
    });
  },

  validate_actionable: function(io, socket, action, game_id) {
    console.log("looking for game:", game_id)
    return io.models.refetch(game_id)
    .catch(function (err){
      console.error(err, socket.id, 'sent a', action, 'to an inactive game', game_id)
      if(game_id.length > 5){
        socket.emit('leave_room', game_id)
      }
    }).then(function (game){
      console.log("found game", game.id)
      return new Promise(function (resolve, reject){
        if(!game){
          console.error(err, socket.id, 'sent a', action, 'to an inactive game', game_id)
          if(game_id.length > 5){
            socket.emit('leave_room', game_id)
          }
          return reject(false)
        }
        console.log('good game id')

        if(!RULES.hasOwnProperty(game.kind)){
          console.error("for some reason we dont recognize this rule set:", game.kind)
          return reject(false)
        }
        console.log('good game kind')


        var ruleset = RULES[game.kind]
        if(ruleset.player_actions().indexOf(action) == -1){
          console.error("bad action, players cannot", action, 'in a game of', game.kind)
          return reject(false)
        }
        console.log('good action')

        // TODO make sure this socket_id 
        // is updated between disconnects
        var acting_user_id = socket.handshake.session.user_id
        if(acting_user_id != game.active_player){
          console.error(socket.id, 'user:', acting_user_id, 'sent a ', action,', but its still', game.active_player, "\'s turn")
          return reject(false)
        }
        console.log('good user')

        // flood detection
        // milliseconds
        // this also "fixes" a bug that causes clients to emit
        // twice every time they send for some reason
        var RATE_LIMIT = 800
        if(game.last_player_id == acting_user_id && game.last_action == action){
          var elapsed = (new Date).getTime()-game.last_action_time
          if(elapsed > RATE_LIMIT){
            console.log('action was long enough after to avoid rate limit elapsed:', elapsed, 'ms', "RATE_LIMIT:", RATE_LIMIT)
          }else{
            console.error(game.last_player_id, 'on', socket.id, 'is flooding with', action, 'at', elapsed,'ms', "RATE_LIMIT:", RATE_LIMIT)
            return reject(false)
          }
        }else{
          console.log('new action', action, 'or socket, rate limit ignored')
        }

        game.last_player_id = acting_user_id
        game.last_action = action
        game.last_action_time = (new Date).getTime()
        resolve(game)
      }).then(function (game){
        // console.log('saving game before', action, game)
        return game.save()
      }).catch(function (err){
        console.error('validate_actionable', err)
        return
      })
    })
  }
});

module.exports = Game