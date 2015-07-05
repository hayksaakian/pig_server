var Promise = require('bluebird')

var Pig = function() {
}

Pig.SCORE_TO_WIN = 20

Pig.player_actions = function() {
  return ['roll', 'hold']
}

Pig.prepare = function (io, game) {
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
}

Pig.roll = function(io, game){
  return Pig.prepare(io, game).then(function (turn){
    // TODO: decouple
    return turn.roll()
  }).then(function (turn){
    return io.models.game.refetch(turn.game.id)
  }).then(function (game){
    console.log((new Date).getTime(), game.active_player, 'rolled', game.turns[0])

    game.emit(io, 'roll_result', game)
    if(!game.turns[0].bust){
      return
    }
    game.turns[0].completed = true
    game.turns[0].save().catch(function (err){
      console.error(err, 'failed to set busted turn as completed')
    }).then(function (turn){
      // return io.models.game.refetch(turn.game.id)
      return io.models.game.refetch(game.id)
    }).then(function (game){
      Pig.between_turns(io, game)    
    })
  })
},

Pig.hold = function(io, game){
  var turn = game.turns[0]
  // turn.hold()
  if(turn.roller == game.player1.id){
    game.totals_player1 += turn.total()
  }else if(turn.roller == game.player2.id){
    game.totals_player2 += turn.total()
  }

  game.emit(io, 'hold_result', game)

  turn.completed = true
  turn.save().catch(function (err){
    console.error(err, 'failed to set held turn as completed')
  }).then(function (turn){
    return game.save()
  }).catch(function (err){
    console.error(err, 'failed to save player total')
  }).then(function (game){
    return io.models.game.refetch(game.id)
  }).then(function (game){
    Pig.between_turns(io, game)    
  })
},

Pig.between_turns = function(io, game){
  var total = 0
  if (game.active_player == game.player1.id){
    total = game.totals_player1
  }else if (game.active_player == game.player2.id){
    total = game.totals_player2
  }
  console.log('win? total:', total, 'SCORE_TO_WIN:', Pig.SCORE_TO_WIN)
  if(total >= Pig.SCORE_TO_WIN){
    game.declare_winner(io, game.active_player)
    return
  }

  // swap the active player
  var new_active_player = null
  if(game.active_player == game.player1.id){
    new_active_player = game.player2.id
  }else if(game.active_player == game.player2.id){
    new_active_player = game.player1.id
  }
  game.active_player = new_active_player
  console.log('between_turns', 'new_active_player:', new_active_player)
  game.save().catch(function (err){
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
}

module.exports = Pig
