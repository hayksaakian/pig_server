var Waterline = require('waterline')

var User = Waterline.Collection.extend({

  identity: 'user',
  connection: 'myRedis',

  attributes: {
    name: 'string',
    created_at: 'integer',
    last_connect: 'integer',
    last_ip: 'string',
    wins: 'integer',
    losses: 'integer',

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
  }
});

module.exports = User