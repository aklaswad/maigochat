
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , fs     = require('fs')
  , moment = require('moment');
  ;
var app = module.exports = express.createServer();
var conf = JSON.parse(fs.readFileSync('./config.json'));

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
    , iohost: conf.iohost
    , socket: 'ws://' + conf.iohost
    , roomurl: 'http://' + conf.host + '/room/' + roomid
  });
});

// Bootstrap
var server = app.listen(conf.listen);

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
var io = require('socket.io').listen(conf.ioport);

io.configure('production', function(){
  io.enable('browser client etag');
  io.set('log level', 1);

  io.set('transports', [
    'websocket'
  , 'flashsocket'
  , 'htmlfile'
  , 'xhr-polling'
  , 'jsonp-polling'
  ]);
});

io.configure('development', function(){
  io.set('transports', ['websocket']);
});

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
  console.log(new Date(), 'connected: ', name, socket.id);
  var user = { id: uid, name: name, lat: 0.0, lng: 0.0 };
  var room = ROOMS[roomid];
  if ( !room ) {
    ROOMS[roomid] = room = { users: {}, logs: [] };
  }
  if ( room.expireTimer ) {
    console.log('Abort to remove room: ', roomid);
    clearTimeout(room.expireTimer);
  }
  var users = room.users;
  room.users[uid] = user;
  var welcome = {
    users: room.users
    , logs: room.logs
    , you: user
  };

  socket.emit('welcome', welcome);
  socket.broadcast.to(roomid).emit('join', {user:user});

  socket.on('message', function (data) {
    data.user = user;
    data.date = moment().utc().format("LLL");
    io.sockets.in(roomid).emit('message', data);
    room.logs.push(data);
    if ( room.logs.length > 50 ) room.logs.shift();
  });

  socket.on('update', function (msg) {
    user = users[user.id] = msg;
    io.sockets.in(roomid).emit('update', { user: user });
  });

  socket.on('disconnect', function() {
    delete users[uid];
    console.log(new Date(), 'disconnected ', user.name, socket.id);
    socket.leave(roomid);
    socket.broadcast.to(roomid).emit('leave', { user: user });
    var c = 0;
    for ( var u in users ) { c++; }
    if (!c ) {
      console.log('Scheduled to remove room after 6 hours: ', roomid);
      room.expireTimer = setTimeout( function () {
        console.log('Removed room: ', roomid);
        delete ROOMS[roomid];
      }, 1000 * 60 * 60 * 6);
    }
  });
});

