var Waterline = require('waterline')

var User = Waterline.Collection.extend({

  identity: 'user',
  connection: 'myRedis',

  attributes: {
    name: 'string',
    created_at: 'integer',
    last_connect: 'integer',
    last_ip: 'string',
    
    wins: {
      type: 'integer',
      defaultsTo: 0
    },
    
    losses: {
      type: 'integer',
      defaultsTo: 0
    },

    games_hosted: {
      collection: 'game',
      via: 'player1'
    },
    games_joined: {
      collection: 'game',
      via: 'player2'
    },
    games_won: {
      collection: 'game',
      via: 'winner'
    },
    games_lost: {
      collection: 'game',
      via: 'loser'
    },
    games_active: {
      collection: 'game',
      via: 'active_player'
    },
    // games: {
    //   collection: 'game',
    //   via: 'players',
    //   dominant: true
    // },
    turns: {
      collection: 'turn',
      via: 'roller'
    }
  },
  leaderboard: function (io) {
    return io.models.user.find()
      .sort({ wins: 'desc' })
      .limit(5)
  }
});

module.exports = User