var Waterline = require('waterline')
var Promise = require('bluebird')
var SCORE_TO_WIN = 20

// figure out how to require this properly
var Game = Waterline.Collection.extend({

  identity: 'game',
  connection: 'myRedis',

  attributes: {
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

    roll: function(io){
      io.models.game.refetch(this.id)
      .then(function (game){
        return new Promise(function (resolve, reject){
          if(game.turns.length > 0){
            return resolve(game.turns[0])
          }
          console.log('new turn for game:', game.id, "roller:", game.active_player)
          io.models.turn.create({
            game: game.id,
            roller: game.active_player
          }).then(function (turn){
            resolve(turn)
          })
        })
      }).then(function (turn){
        return turn.roll()
      }).then(function (turn){
        return io.models.game.refetch(turn.game.id)
      }).then(function (game){
        console.log((new Date).getTime(), game.active_player, 'rolled', game.turns[0])

        game.emit(io, 'roll_result', game)
        if(game.turns[0].bust){
          game.between_turns(io)
        }
      })
    },

    hold: function(io){
      io.models.game.refetch(this.id)
      .then(function (game) {
        var turn = game.turns[0]
        // turn.hold()
        if(turn.roller == game.player1.id){
          game.totals_player1 += turn.total()
        }else if(turn.roller == game.player2.id){
          game.totals_player2 += turn.total()
        }
        // this['totals'][this.active_player_id] += total;
        game.emit(io, 'hold_result', game);
        game.between_turns(io);
      })
    },

    between_turns: function(io){
      var total = 0
      if (this.active_player == this.player1.id){
        total = this.totals_player1
      }else if (this.active_player == this.player2.id){
        total = this.totals_player2
      }
      if(total >= SCORE_TO_WIN){
        this.declare_winner(io, this.active_player)
        return;
        // move this over to another hash? out of active games?
      }
      //no winner yet

      // swap the active player
      var new_active_player = null
      if(this.active_player == this.player1.id){
        new_active_player = this.player2.id
      }else if(this.active_player == this.player2.id){
        new_active_player = this.player1.id
      }
      this.active_player = new_active_player
      console.log('between_turns', 'new_active_player:', new_active_player)
      this.save().catch(function (err){
        console.error(err, 'failed to set new active player')
      }).then(function (game){
        return io.models.game.refetch(game.id)
      }).then(function (game){
        return new Promise(function (resolve, reject){
          // if(game.turns.length > 0){
          //   return resolve(game.turns[0])
          // }
          io.models.turn.create({
            game: game.id,
            roller: game.active_player
          }).then(function (turn){
            resolve(turn)
          })
        })
      }).catch(function (err){
        console.error(err, 'failed to add a turn for active player')
      }).then(function (turn){
        return io.models.game.refetch(turn.game)
      }).then(function (game){
        game.emit(io, 'start_turn', game)
      })
    
    },
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

  set_listeners: function(game_id, io, socket, validator){
    socket.on('game:'+game_id, function (action){
      if(['roll', 'hold'].indexOf(action) == -1){
        return
      }
      console.log("-------------------------------")

      console.log('user:',socket.handshake.session.user_id, 'socket:', socket.id, action+'ing for game:'+game_id)
      validator(socket, action, game_id)
      .then(function (game){
        if(game){
          game[action](io)            
        }else{
          console.log('no valid way to', action, 'for game:', game_id)
        }
      })
    });
  },
});

module.exports = Game