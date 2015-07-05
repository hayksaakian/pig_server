var React = require('react');
var addons = require('react-addons');


var DIE_MAP = [
  <i className='fi-die-one large red'></i>,
  <i className='fi-die-two large'></i>,
  <i className='fi-die-three large'></i>,
  <i className='fi-die-four large'></i>,
  <i className='fi-die-five large'></i>,
  <i className='fi-die-six large'></i>,
]


var PigBoard = React.createClass({
  render: function(){
    return(
      <div className="row">
        <div className="col-md-6">
          <ScoreCard player={this.props.game.player1} game={this.props.game} user={this.props.user} sendAction={this.props.sendAction} />
        </div>
        <div className="col-md-6">
          <ScoreCard player={this.props.game.player2} game={this.props.game} user={this.props.user} sendAction={this.props.sendAction} />
        </div>
      </div>
    )
  }
})

var ScoreCard = React.createClass({
  sortByCreatedAt: function(a, b){
    if (a.createdAt > b.createdAt) {
      return 1;
    }
    if (a.createdAt < b.createdAt) {
      return -1;
    }
    // a must be equal to b
    return 0;
  },
  render: function(){
    var player = this.props.player
    var turns  = (this.props.game.turns || []).filter(function (turn){
      return turn.roller == player.id
    }).sort(this.sortByCreatedAt)

    var score = this.props.player.id == this.props.game.player1.id ? this.props.game.totals_player1 : this.props.game.totals_player2

    var turns_markup = turns.map(function (turn){
      return <Turn turn={turn} />
    })

    var turn_actions  = "";
    if(this.props.game.active && this.props.game.active_player == this.props.player.id){
      if(this.props.game.active_player == this.props.user.id){
        turn_actions = <GameActions sendAction={this.props.sendAction} turn={turns.length > 0 ? turns[turns.length-1] : null} />
      }else{
        turn_actions = <h4><em>Waiting for {this.props.player.name}</em></h4>
      }
    }else{
      if(this.props.game.winner_id == this.props.player.id){
        turn_actions = <h4>{this.props.player.name} WINS</h4>
      }else if(this.props.game.loser_id == this.props.player.id){
        turn_actions = <h4>{this.props.player.name} loses...</h4>
      }
    }

    return (
      <div className="ScoreCard">
        <ul className="unstyled turns">
          <li>
            <span data-placement="top" data-toggle="tooltip" title={this.props.player.id} className="name">
              {this.props.player.name}
            </span>
            <span className="score"> {score}</span>
          </li>
          {turns_markup}
        </ul>
        {turn_actions}
      </div>
    )
  }
})

var Turn = React.createClass({
  render: function(){
    var turn = this.props.turn;

    // WARNING:this props may be bugged due to the bind. since game.id is used later on
    var turn_total = turn.values.reduce(function (previous, v) {
      return previous + v;
    }, 0)


    var value_markup = turn.values.map(function (value, i){
      var die = DIE_MAP[value-1]
      if(i % 2 == 1 && i != turn.values.length-1){
        var die = <span>{die} <i className='fi-plus'></i> </span>
      }
      return die
    })

    var bust_markup = ""
    if(turn.bust){
      bust_markup = (<span>BUST!! <i className='fi-skull'></i> </span>)
    }

    var values_class = turn.bust ? "values crossed-out" : "values"

    return (
      <li className="turn">
        <span className="turn_total">{bust_markup}{turn_total} = </span>
        <span className={values_class}> {value_markup}</span>
      </li>
    )
  }
})

var GameActions = React.createClass({
  render: function(){
    // WARNING:this props may be bugged due to the bind. since game.id is used later on
    var points = ""
    var turn = this.props.turn
    if(turn){
      points = turn.values.reduce(function (a, b) {
        return a + b;
      }, 0)
    }

    return (
      <div className="btn-toolbar">
        <button type="button" onClick={this.props.sendAction.bind(this, 'roll')} className="btn rollbtn">Roll</button>
        <button type="button" onClick={this.props.sendAction.bind(this, 'hold')} className="btn holdbtn">Hold {points}</button>
      </div>
    )
  }
})



module.exports = PigBoard
