$(function() {
  var latlng = new google.maps.LatLng(35.709984,139.810703);
  var opts = {
    zoom: 15,
    center: latlng,
    disableDefaultUI: true,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };
  var Map = new google.maps.Map(document.getElementById("map"), opts);

  var User = function (opts) {
    return this.init(opts);
  };
  User.prototype = {
    init: function (opts) {
      this.$el = $('<li class="user" />');
      this.$el.appendTo('#users');
      this.marker = new google.maps.Marker({});
      this.marker.setMap(Map);
      this.update(opts);
    }
    , update: function (opts) {
      var shouldUpdateLatLng = false;
      if ( this.lat !== opts.lat || this.lng !== opts.lng ) {
        shouldUpdateLatLng = true;
      }
      $.extend(this, opts);
      if ( shouldUpdateLatLng ) this.updateLatLng();
      this.render();
    }
    , updateLatLng: function () {
      if ( !this.lat || !this.lng ) return;
      var latlng = new google.maps.LatLng(this.lat, this.lng);
      this.marker.setPosition( latlng );
      if ( this.following ) {
        Map.setCenter(latlng);
      }
    }
    , render: function () {
      var html = '<a href="#" class="username" data-uid="' + this.id + '">' + this.name + '</a>';
      this.$el.empty().append( $(html) );
    }
    , remove: function () {
      this.$el.remove();
      this.marker.setMap(null);
    }
    , follow: function () {
      this.following = true;
      this.updateLatLng();
    }
    , unfollow: function () {
      this.$el.removeClass('following');
      this.following = false;
    }
  };

  var UserCollection = {
    users: {}
    , init: function (users) {
      for ( uid in users ) {
        this.users[uid] = new User( users[uid] );
      }
    }
    , add: function (user) {
      this.users[user.id] = new User( user );
    }
    , update: function (opts) {
      if (typeof this.users[opts.id] === 'undefined' ) {
        this.add(opts);
      }
      this.users[opts.id].update(opts);
    }
    , remove: function (opts) {
      this.users[opts.id].remove(opts);
      delete this.users[opts.id];
    }
    , follow: function (opts) {
      for ( uid in this.users ) {
        this.users[uid].unfollow();
      }
      this.users[opts.id].follow();
    }
  };

  var ChatClient = function (opts) {
    return this.init(opts);
  };

  ChatClient.prototype = {
    init: function (opts) {
      this.users = UserCollection;
      var chat = this
        , socket = this.socket = io.connect(opts.socket)
        ;
      socket.on('connect', function() {
        console.log('connected');
      });

      socket.on('msg push', function (msg) {
        chat.log( msg.user.name + ': ' + msg.msg );
      });

      socket.on('welcome', function (msg) {
        chat.users.init(msg.users);
//        chat.users.add msg.you;

      });

      socket.on('join', function (msg) {
        chat.users.add(msg.user);
        chat.log(msg.user.name + ' joined');
      });

      socket.on('leave', function (msg) {
        chat.log(msg.user.name + ' leaved');
        chat.users.remove(msg.user);
      });
      socket.on('update', function(msg) {
        chat.users.update(msg.user);
      });
      socket.on('loc', function (msg) {
        chat.users.update(msg.user);
      });

      $('#posttext').click(function() {
        var msg = $('#text').val();
        socket.emit('talk', msg);
      });

      $('#rename').click(function () {
        var name = $('#name').val();
        socket.emit('rename', name);
      });

      $('.username').live('click',function () {
        chat.users.follow({ id: $(this).attr('data-uid') });
        return false;
      });

      $('#sendloc').click( function () {
        navigator.geolocation.getCurrentPosition( function (e) {
          chat.socket.emit('loc', {lat: e.coords.latitude, lng: e.coords.longitude });
        });
      });

      navigator.geolocation.watchPosition(function (e) {
        chat.socket.emit('loc', {lat: e.coords.latitude, lng: e.coords.longitude });
      });
    }
    , log: function (msg) {
      $('#log').prepend($('<li>' + msg + '</li>'));
    }
  };


  window.ChatClient = ChatClient;
});