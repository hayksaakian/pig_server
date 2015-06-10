var Waterline = require('waterline')
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
      defaultsTo: false,
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

    disconnects: 'array',

    emit: function(io, event_name, obj){
      return io.to('game:'+this.id).emit(event_name, obj)
    },

    start: function(io){
      this.emit(io, 'create_game', this)
      this.emit(io, 'joined_room', 'game:'+this.id)
      this.emit(io, 'left_room', 'matchmaking')
      this.emit(io, 'start_turn', this)
    },

    reload: function(io){
      this.populate('player1')
      .populate('player2')
      .populate('turns', {sort: 'createdAt DESC'})
      .then(function (game){
        game.emit(io, 'reload_game', game)   
        game.emit(io, 'joined_room', 'game:'+game.id)
      })
    },

    set_listeners: function(socket){
      // socket.on('derp', function(derp){
      //   socket.emit('server_broadcast', derp);
      // });
      ['roll', 'hold'].forEach(function (action){
        socket.on(action, function(game_id){
          console.log(socket.id, action+'ing for game:'+game_id)
          validate_actionable(socket, action, game_id)
          .then(function (game){
            game[action]()
          })
        });
      })
    },

    roll: function(io){
      this.populate('turns', {sort: 'createdAt DESC'})
      .then(function (game){
        var turn = game.turns[0]
        turn.roll().then(function (turn){
          console.log((new Date).getTime(), game.active_player, 'rolled', turn)
          // game.last_total = turn.total()
          game.emit(io, 'roll_result', game)
          if(turn.bust){
            game.between_turns(io)
          }else{
            game.save()
          }
        })
      })
    },

    hold: function(io){
      this.populate('turns', {sort: 'createdAt DESC'})
      .then(function (game) {
        var turn = game.turns[0]
        // turn.hold()
        if(turn.roller == game.player1){
          game.totals_player1 += turn.total()
        }else if(turn.roller == game.player2){
          game.totals_player2 += turn.total()
        }
        // game.last_total = turn.total()
        // this['totals'][this.active_player_id] += total;
        game.emit(io, 'hold_result', game);
        game.between_turns(io);
      })
    },

    between_turns: function(io){
      var total = 0
      if (this.active_player == this.player1){
        total = this.totals_player1
      }else if (this.active_player == this.player2){
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
      if(this.active_player == this.player1){
        new_active_player = this.player2
      }else{
        new_active_player = this.player1
      }

      this.spread({
        active_player: new_active_player
      }).catch(function (err){
        console.error(err, 'failed to set new active player')
      }).then(function (game){
        return game.turns.add({
          roller: game.active_player
        })
      }).catch(function (err){
        console.error(err, 'failed to add a turn for active player')
      }).then(function (game){
        return game.save()
      }).then(function (game){
        return game.populate('turns', {sort: 'createdAt DESC'})
      }).then(function (game){
        game.emit(io, 'start_turn', game)
      })
    
    },
    declare_winner: function(io, winner_id){
      this.populate('player1').populate('player2')
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

        var game = this.update({
          winner: winner_id,
          loser: loser_id,
          active: false
        })
        // TODO: this needs testing
        return [game, winner.save(), loser.save()]
      }).spread(function (games, winner, loser){
        // .update always resolves to an array
        var game = games[0]
        console.log(winner.name, 'wins', loser.name, 'loses')
        // TODO: do we need to populate anything?
        io.emit('game_end', game)
      })
    },

    leaver: function(user_id){
      if(this.disconnects.indexOf(user_id) !== -1){
        this.disconnects.push(user_id)      
      }
      if(this.disconnects.length == 2){
        this.active = false
        this.save()
      }
    }
  },
  // // 'class' methods
  // assemble: function(player1_id, player2_id){
  // },

});

module.exports = Game