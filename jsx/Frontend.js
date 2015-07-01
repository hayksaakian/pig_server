var React = require('react');
var addons = require('react-addons');
global.React = React;
// var MagicMove = require('./react-magic-move');
var classNames = require('classnames');

var DIE_MAP = [
  "<i className='fi-die-one large red'></i>",
  "<i className='fi-die-two large'></i>",
  "<i className='fi-die-three large'></i>",
  "<i className='fi-die-four large'></i>",
  "<i className='fi-die-five large'></i>",
  "<i className='fi-die-six large'></i>",
]

var socket = null

var Frontend = React.createClass({
  getInitialState: function() {
    return this.props
  },

  componentDidMount: function(){
    console.log('setting on good_log_in')
    socket.on('good_log_in', function (user){
      console.log('good_log_in, setting state to new user', user)
      this.setState(function (previousState){
        previousState.user = user
        return previousState
      })
      // $('#username').text(nuser['name'])
      // $('#username').attr('title', nuser['id'])
      // $('#login').hide()
      // $('.chat').show()
    }.bind(this))
  },
  render: function () {
    return (
      <div id="test">
        <Header user={this.state.user} />
        <div className="container" style={{height: '80%'}}>
          <Login onLoginRecieve={this.handleLoginRecieve} user={this.state.user} />

          <div className="row" style={{height: '100%'}}>
            <div className="col-md-8">
              <Main />
            </div>
            <div className="col-md-4">
              <ChatContainer user={this.state.user}  />
              <Leaderboard />
            </div>
          </div>
        </div>
      </div>
    )
  }
})

var MatchmakingView = React.createClass({
  render: function () {
    return (
      <div id="matchmaking_view">
        <h3>Matchmaking list</h3>
        <div id="matchmaking">
        </div>            
      </div>
    )
  }
})

var Main = React.createClass({
  getInitialState: function () {
    return {
      disabled: false,
      games: {},
      matchmaking_button_text: "Search for a Game"
    }
  },
  search_for_match: function(){
    socket.emit('search_for_match')
    this.setState({disabled: true})
  },
  ensureGame: function (g){
    // console.log('create_game', g)
    // $('#search_for_match').text("Search for another Game")
    // ensureGame(g)
    // $("#search_for_match").prop("disabled", false)
    this.setState(function (previousState){
      previousState.matchmaking_button_text = "Search for another Game"
      previousState.disabled = false
      previousState.games[g.id] = g
      return previousState
    })
  },
  componentDidMount: function(){
    socket.on('reload_game', this.ensureGame.bind(this))
    socket.on('create_game', this.ensureGame.bind(this))
  },
  render: function () {
    return (
      <div id="main">
        <MatchmakingView />
        <div id="games_view">
          <h3>Games</h3>
          <GameContainer games={this.state.games} user={this.props.user} />
          <hr />
          <button onClick={this.search_for_match.bind(this)} disabled={this.state.disabled} className="btn btn-success navbar-btn" id="search_for_match">
            {this.state.matchmaking_button_text}
          </button>
        </div>
      </div>
    )
  }
})

var GameContainer = React.createClass({
  render: function(){
    var gameNodes = (Object.keys(this.props.games) || []).map(function (gameid, i){
      var game = this.props.games[gameid]
      return (
        <Game game={game} user={this.props.user}/>
      )
    }.bind(this))
    return (
      <div id="games">
        {gameNodes}
      </div>
    )
  }
})

var Game = React.createClass({
  render: function(){
    return (
      <div className="game" id={this.props.game.id}>
        <h4>Game: {this.props.game.id}</h4>
        <div className="gameinfo">
          <div className="row">
            <div className="col-md-6">
              <ul className="unstyled turns">
                <li>
                  <span data-placement="top" data-toggle="tooltip" title={g.player1.id} className="name">
                    {g.player1.name}
                  </span>
                  <span class="score">{g.totals_player1}</span>
                </li>
              </ul>
            (g.player1.id == user.id ? '<div class="gameactions"></div>': "")
            </div>
            <div className="col-md-6">
              <ul className="unstyled turns">
                <li>
                  <span data-placement="top" data-toggle="tooltip" title={g.player2.id} className="name">
                    {g.player2.name}
                  </span>
                  <span class="score">{g.totals_player2}</span>
                </li>
              </ul>
              (g.player2.id == user.id ? '<div class="gameactions"></div>': "")
            </div>
          </div>
        </div>
      </div>
    )
  }
})

// TODO
// scroll down
// toggle active
var ChatContainer = React.createClass({
  getInitialState: function(){
    return {
      rooms: {
        'server-broadcast': {
          human_name: "Global Chat",
          name: "server-broadcast",
          messages: [],
          unread: 0
        }
      },
      active_room: "server-broadcast",
      active_tab: 0
    }
  },
  handleChatSubmit: function (msg) {
    msg.roomname = this.state.active_room
    msg.user = this.props.user

    // console.log('sending a message', msg)
    socket.emit('send_message', msg)
  },
  handleMessage: function(obj){
    console.log('message', obj)
    this.setState(function (previousState){
      if(previousState.rooms[obj.roomname]){
        previousState.rooms[obj.roomname].messages.push(obj)        
      }else{
        previousState.rooms[obj.roomname] = {
          human_name: obj.roomname,
          name: obj.roomname,
          messages: [
            obj
          ],
          unread: 0
        }
      }
      return previousState
    })
  },
  switchTab: function (idx, roomname) { 
    this.setState({active_room: roomname, active_tab: idx});
  },
  handleClick: function(idx, roomname, e) {
    e.preventDefault();
    this.switchTab(idx, roomname);
  },
  componentDidMount: function () {
    socket.on('joined_room', function (roomname){
      console.log('joined_room', roomname)
      var obj = {roomname: roomname}
      if(!this.state.rooms[obj.roomname]){
        this.setState(function (previousState){
          previousState.rooms[obj.roomname] = {
            human_name: obj.roomname,
            name: obj.roomname,
            messages: [],
            unread: 0
          }
          return previousState
        })
      }
    }.bind(this))

    socket.on('server_broadcast', function (message) {
      this.handleMessage({
        roomname: 'server-broadcast',
        message: message,
        user: {name: "Game Server"}
      })
    }.bind(this))

    socket.on('message', this.handleMessage)

    socket.on('left_room', function (roomname){
      console.log('left_room', roomname)
      this.setState(function (previousState){
        // TODO some special case for the matchmaking room
        delete previousState[roomname]
        return previousState
      })
    }.bind(this))

  },
  render: function(){
    var rooms = this.state.rooms || [];
    var controls = []
    var chatboxes = []

    var roomnames = Object.keys(rooms)
    roomnames.forEach(function (roomname, i) {
      var room = rooms[roomname]
      room.active = room.name == this.state.active_room
      var css_class = room.active ? 'active' : ''
      var css_name = room.name + "-chat"
      var css_href = "#"+css_name
      var css_id = room.name+"-chat-picker"

      controls.push(
        <li role="presentation" className={css_class} onClick={this.handleClick.bind(this, i, roomname)}>
          <a href={css_href} id={css_id} aria-controls={css_name} role="tab" data-toggle="tab" data-roomname={room.name}>
          {room.human_name} <span data-unread={room.unread} className="label label-info label-as-badge">{room.unread != 0 ? room.unread : ''}</span>
          </a>
        </li>
      )
      var css_messages_class = "chatBox tab-pane fade in chat-lines " + css_class
      chatboxes.push(
        <Chatbox room={room} key={css_name} css_class={css_messages_class}  />
      )
    }.bind(this))

    return (
      <div className="well chat-container">
        <div className="chat" role="tabpanel">
          <ul className="nav nav-tabs" id="roompicker" role="tablist">
            {controls}
          </ul>
          <div className="tab-content chatboxes">
            {chatboxes}
          </div>
          <ChatForm onChatSubmit={this.handleChatSubmit} />
        </div>
      </div>
    )
  }
})


// done
var Chatbox = React.createClass({
  // TODO: fix this so it doesn't scroll to bottom if it gets a new message out of focux
  // unless you're already at the bottom
  componentWillUpdate: function() {
    var node = this.getDOMNode();
    this.shouldScrollBottom = node.scrollTop + node.offsetHeight === node.scrollHeight;
  },
   
  componentDidUpdate: function() {
    if (this.shouldScrollBottom) {
      var node = this.getDOMNode();
      node.scrollTop = node.scrollHeight
    }
  },
  render: function(){
    
    var chatNodes = (this.props.room.messages || []).map(function (message) {
      // console.log('rendering message', message)
      return (
        <li author={message.user}>
          {message.user.name}: {message.message}
        </li>
      )
    })
    
    return (
      <ul id={this.props.key} role="tabpanel" className={this.props.css_class}>
        {chatNodes}
      </ul>
    )
  }
})

var ChatForm = React.createClass({
  handleSubmit: function(e){
    e.preventDefault()
    var text = React.findDOMNode(this.refs.text).value.trim()
    if(!text){
      return
    }

    this.props.onChatSubmit({message: text});
    React.findDOMNode(this.refs.text).value = '';
    return;

  },
  render: function(){
    return (
      <form className="form-inline chat-input-box input-group" onSubmit={this.handleSubmit}>
        <input className="form-control" id="message" autoComplete="off" placeholder="Enter a message..." ref="text" />
        <span className="input-group-btn"> 
          <button id="send_message" type="submit" className="btn">Send</button>
        </span>
      </form>
    )
  }
})


// Done!
var Leaderboard = React.createClass({
  getInitialState: function(){
    return {
      leaders: []
    }
  },
  componentDidMount: function () {
    socket.on('leaderboard', function (leaders){
      console.log('leaders', leaders)
      this.setState({leaders: leaders})
    }.bind(this))
  },
  render: function(){
    var leaders = this.state.leaders || []

    var items = leaders.map(function (leader){
      return (
        <li>{leader.name}  W:{leader.wins} L:{leader.losses}</li>
      )
    })

    return (
      <div id="leaderboard">
        <h3>Leaderboard</h3>
        <ol id="leaderboard_list">
          {items}
        </ol>
      </div>
    )
  }
})


var Login = React.createClass({
  handleSubmit: function(e){
    e.preventDefault()
    var username = React.findDOMNode(this.refs.name).value.trim()
    if(!username){
      return
    }
    console.log("Logging in!!", username)
    socket.emit('log_in', {name: username})

    React.findDOMNode(this.refs.name).value = '';
    return
  },
  render: function () {
    if(this.props.user && this.props.user.name){
      return <div></div>
    }
    return (
      <div className="row">
        <div className="col-md-4 col-md-offset-4 well" id="login">
          <form className="form" onSubmit={this.handleSubmit}>
            <div className="input-group">
              <input type="text" className="form-control" placeholder="Name" id="name" name="name" ref="name" autofocus />
              <span className="input-group-btn">
                <input id="loginbtn" className="btn btn-default" type="submit" value="Log In" />
              </span>
            </div>
          </form>
        </div>
      </div>
    )
  }
})


var Header = React.createClass({
  getInitialState: function() {
    var user = this.props.user
    return {
      user: {
        id: (user && user['id']) ? user.id : "User ID",
        name: (user && user['name']) ? user.name : "User Name" ,
        wins: (user && user.hasOwnProperty('wins') ? user.wins : ''),
        losses: (user && user.hasOwnProperty('losses') ? user.losses : '')
      },
      server_status: "Server Status"
    }
  },
  componentDidMount: function () {
    socket.on('status', function (status){
      console.log('status:', status)
      this.setState(function (previousState){
        previousState.server_status = status;
        return previousState
      })
    }.bind(this))
  },
  render: function () {
    return (
      <header className="navbar navbar-static-top navbar-inverse bs-docs-nav" id="top" role="banner">
        <div className="container">
          <div className="navbar-header">
            <button className="navbar-toggle collapsed" type="button" data-toggle="collapse" data-target=".bs-navbar-collapse">
              <span className="sr-only">Toggle navigation</span>
              <span className="icon-bar"></span>
              <span className="icon-bar"></span>
              <span className="icon-bar"></span>
            </button>
            <a href="/" className="navbar-brand"><i className="fi-die-one"></i> Pig with Socket.io</a>
          </div>
          <nav className="collapse navbar-collapse bs-navbar-collapse">
            <ul className="nav navbar-nav">
              <li className="active">
                <a href="#" data-toggle="tooltip" data-placement="bottom" id="username" title={this.props.user.id}>
                  Name: {this.props.user.name}
                </a>
              </li>
              <li>
                <a href="#" id="wins">{this.props.user.wins} Wins
                </a>
              </li>
              <li>
                <a href="#" id="losses">{this.props.user.losses} Losses
                </a>
              </li>
            </ul>
            <ul className="nav navbar-nav navbar-right">
              <li><a href="#" id="status">{this.state.server_status}</a></li>
            </ul>
          </nav>
        </div>
      </header>
    )
  }
})


if(typeof document != 'undefined' && document['title']){
  var App = React.createFactory(Frontend);
  console.log(REACT_PROPS)
  socket = io.connect(':'+REACT_PROPS.port);
  React.render(App(REACT_PROPS), document.getElementById("app"))
}


// module.exports = default_export
module.exports = Frontend;