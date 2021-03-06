var redis_host = '127.0.0.1'
var redis = require('redis')

function makeRedisClient (redis_db) {
  var rv = null
  if(process.env.REDISTOGO_URL){
    var rtg   = require("url").parse(process.env.REDISTOGO_URL);
    rv = redis.createClient(rtg.port, rtg.hostname);
    rv.auth(rtg.auth.split(":")[1]);
  }else{
    rv = redis.createClient('6379', redis_host);
  }
  rv.select(redis_db); 

  rv.on('connect', function() {
    console.log('Connected to redis#'+redis_db.toString());
  });
  rv.on('error', function (er) {
    console.trace('makeRedisClient') // [1]
    console.error(er.stack) // [2]
  })

  return rv
}

module.exports = makeRedisClient