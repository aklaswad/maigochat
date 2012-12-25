
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  ;
var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.set('view options', {
    layout: false
  });
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes
app.get('/', routes.index);

app.get('/create', function (req, res) {
  res.redirect('/room/' + createRoomId());
});

app.get('/room/:id', function (req, res) {
  var roomid = req.params.id;
  if ( roomid.match(/\W/) ) {
    res.redirect('/');
    return;
  }

  res.render('room', {
    title: 'room'
    , roomid: req.params.id
    , socket: 'ws://10.0.1.102:3000/'
    , roomurl: 'http://10.0.1.102:3000/room/' + roomid
  });
});

// Bootstrap
var server = app.listen(3000);

// Socket IO Chat
var ROOMS = {};
var randSource = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
var createRoomId = function () {
  var i, roomid;
  do {
    roomid = '';
    for ( i=0;i<6;i++ ) {
      roomid += randSource[ Math.floor(Math.random() * randSource.length )];
    }
  } while ( ROOMS[roomid] );
  return roomid;
};

//socket.io
var io = require('socket.io').listen(server);
var cookieParser = require('cookie');
var channel = io.on('connection', function (socket) {
  var roomid = socket.handshake.query.roomid;
  if ( !roomid ) { // Need more strict ?
    socket.disconnect();
    return;
  }
  socket.join(roomid);

  var uid = socket.id;
  var cookie_str = socket.handshake.headers.cookie;
  var name = 'anon';
  if ( cookie_str ) {
    var cookie = cookieParser.parse(cookie_str);
    if ( cookie.name ) name = cookie.name;
  }
  var user = { id: uid, name: name, lat: 0.0, lng: 0.0 };
  var room = ROOMS[roomid];
  if ( !room ) {
    ROOMS[roomid] = room = { users: {} };
  }
  var users = room.users;
  room.users[uid] = user;
  var welcome = {
    users: room.users
    , you: user
  };

  socket.emit('welcome', welcome);
  socket.broadcast.to(roomid).emit('join', {user:user});

  socket.on('message', function (data) {
    data.user = user;

    io.sockets.in(roomid).emit('message', data);
  });

  socket.on('update', function (msg) {
    user = users[user.id] = msg;
    io.sockets.in(roomid).emit('update', { user: user });
  });

  socket.on('disconnect', function() {
    delete users[uid];
    socket.leave(roomid);
    socket.broadcast.to(roomid).emit('leave', { user: user });
    var c = 0;
    for ( var u in users ) { c++; }
    if (!c ) {
      console.log('remove room', roomid);
      delete ROOMS[roomid];
    }
  });
});

