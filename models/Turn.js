var Waterline = require('waterline')

var Turn = Waterline.Collection.extend({

  identity: 'turn',
  connection: 'myRedis',

  attributes: {
    game: {
      model: 'game',
      via: 'turns'
    },

    roller: {
      model: 'user',
      via: 'turns'
    },

    values: {
      type: 'array',
      defaultsTo: []
    },

    bust: {
      type: 'boolean',
      defaultsTo: false
    },

    roll: function(){
      var first = 1 + Math.floor(Math.random() * 6);
      var second = 1 + Math.floor(Math.random() * 6);
      if(first == 1 || second == 1){
        this.bust = true
      }
      if(!this.values){
        this.values = []
      }
      this.values.push(first)
      this.values.push(second)
      return this.save()
    },

    total: function(){
      return (this.values || []).reduce(function (previous, v) {
        return previous + v;
      }, 0)
    },
  }
})

module.exports = Turn