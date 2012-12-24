
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
  var roomid = app.createRoom();
  res.redirect('/room/' + roomid);
});

app.get('/room/:id', function (req, res) {
  var roomid = req.params.id;
  if ( roomid.match(/\W/) ) {
    res.redirect('/');
    return;
  }
  if ( !rooms[roomid] ) {
    roomid = app.createRoom(roomid);
  }
  res.render('room', {
    title: 'room'
    , roomid: req.params.id
    , socket: 'ws://10.0.1.102:3000/' + req.params.id
  });
});

// Bootstrap
app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);



//socket.io
var io = require('socket.io').listen(app);
var rooms = {};

var randSource = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
io.on('connection', function (socket) {
  console.log('hlllll');
};

app.createRoom = function (roomid) {
  var i, count = 0, id = 0, room, log = [], users = {};
  if ( !roomid ) {
    do {
      roomid = '';
      for ( i=0;i<6;i++ ) {
        roomid += randSource[ Math.floor(Math.random() * randSource.length )];
      }
    } while ( rooms[roomid] );
  }
  room = rooms[roomid] = io
    .of('/' + roomid)
    .on('connection', function (socket) {
      count++;
      var uid = id++;
      var user = { id: uid, name: 'user' + uid };
      users[uid] = user;
      var welcome = {
        count: count
        , users: users
        , you: user
      };
      socket.emit('welcome', welcome);
      socket.broadcast.emit('join', {user:user});

      socket.on('message', function (data) {
        data.user = user;
        socket.emit('message', data);
        socket.broadcast.emit('message', data);
      });

      socket.on('update', function (msg) {
        user = msg;
        socket.emit('update', { user: user });
        socket.broadcast.emit('update', { user: user });
      });

      socket.on('disconnect', function() {
        count--;
        if ( !count ) {
          console.log('remove ', roomid);
          rooms[roomid] = null;
          return;
        }
        delete users[uid];
        socket.broadcast.emit('leave', { user: user });
      });
    })
  ;
  return roomid;
};
