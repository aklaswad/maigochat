$(function() {
  // very cheep canvas resize.
  // Why? sometimes drawImage() makes images messed up.
  var halfCanvas = function (canvas) {
    var sw = canvas.width
      , sh = canvas.height
      , dw = Math.floor(sw / 2)
      , dh = Math.floor(sh / 2)
      , newcanvas = $('<canvas />').attr({
          width: dw
          , height:dh
        }).get(0)
      , x, y
      , ctx = canvas.getContext('2d')
      , newctx = newcanvas.getContext('2d')
      , data = ctx.getImageData(0,0, sw, sh)
      , newdata = newctx.getImageData(0,0,dw,dh)
      ;
    for (x = 0; x < dw; x++ ) {
      for ( y = 0; y < dh; y++ ) {
        var dbase = x * 4 + dw * y * 4;
        for ( var i=0; i<3; i++) { // RGB
          var xx = x * 2;
          var yy = y * 2;
          var v = Math.round((
              data.data[ xx       * 4 + yy       * sw * 4 + i ]
            + data.data[ (xx + 1) * 4 + yy       * sw * 4 + i ]
            + data.data[ xx       * 4 + (yy + 1) * sw * 4 + i ]
            + data.data[ (xx + 1) * 4 + (yy + 1) * sw * 4 + i ]
          ) / 4);
          newdata.data[ dbase + i ] = v;
        }
        newdata.data[ dbase + 3] = 255;
      }
    }
    newctx.putImageData(newdata, 0, 0);
    return newcanvas;
  };
  var resizeImage = function (data, to_width, cb) {
    var img = $('<img />').bind('load', function () {
      var w = img.get(0).width
        , h = img.get(0).height
        , canvas = $('<canvas />').attr({width: w, height: h}).get(0)
        , ctx = canvas.getContext('2d')
        ;
      ctx.drawImage(img.get(0), 0, 0);
      while ( canvas.width > to_width ) {
        canvas = halfCanvas(canvas);
      }
      cb(canvas.toDataURL('image/jpeg'));
    }).attr('src', data);
  };

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
      this.marker.setTitle(this.name);
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
      var name = $('<div />').text(this.name).html();
      var html = '<a href="#" class="username" data-uid="' + this.id + '">' + name + ( this.me ? ' (me)' : '' ) + '</a>';
      this.$el.empty().append( $(html) );
    }
    , remove: function () {
      this.$el.remove();
      this.marker.setMap(null);
    }
    , follow: function () {
      this.$el.addClass('following');
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
        , socket = this.socket = io.connect(opts.socket + '?roomid=' + opts.roomid)
        ;
      socket.on('connect', function() {
        console.log('connected');
      });

      socket.on('message', function (msg) {
        if ( msg.text ) {
          var html = $('<div />').text(msg.text).html();
          html = html.replace(/(https?:\/\/[\S]+)/g, "<a href='$1'>$1</a>");
          chat.log({ user: msg.user, el: $('<span class="message" />').html(html)});
        }
        if ( msg.photo ) {
          chat.log({ user: msg.user, el: $('<img width="320" />').attr('src', msg.photo) });
        }
      });
      socket.on('welcome', function (msg) {
        msg.users[ msg.you.id ].me = true;
        chat.me = msg.you;
        chat.users.init(msg.users);
      });

      socket.on('join', function (msg) {
        chat.users.add(msg.user);
      });

      socket.on('leave', function (msg) {
        chat.users.remove(msg.user);
      });

      socket.on('update', function(msg) {
        chat.users.update(msg.user);
      });

      $('#textform').submit(function () {
        var msg = $('#text').val();
        if ( !msg || msg.length === 0 ) return false;
        socket.emit('message',{ text: msg});
        $('#text').val('').focus();
        return false;
      });

      $('.username').live('click',function () {
        chat.users.follow({ id: $(this).attr('data-uid') });
        return false;
      });

      $('#config-toggle').click( function () {
        $('body').css('overflow', 'hidden');
        $('#config').show(200);
      });

      $('#config .cancel').click( function () {
        $('body').css('overflow', 'default');
        $('#config').hide(200);
        return false;
      });

      $('#config-form').submit( function () {
        var name = $('#name').val();
        if ( name && name.length !== 0 && name !== chat.me.name ) {
          chat.me.name = name;
          $.cookie('name', name, { expires: 7, path: '/' });
          socket.emit('update', chat.me);
        }
        $('body').css('overflow', 'default');
        $('#config').hide(200);
        return false;
      });

      $('#uploadphoto').click( function () {
        $('#photo-input').click();
      });
      $('#photo-input').change( function (e) {
        var $input = $(this);
        canvasResize(e.target.files[0], {
          width: 1024,
          height: 0,
          crop: false,
          quality: 100,
          callback: function(data) {
            resizeImage(data,256,function (resized) {
              chat.socket.emit('message', {'photo': resized});
              $input.val('');
            });
          }
        });
        return false;
      });

      $('.tab').click( function () {
        var target = $(this).attr('data-target');
        $('.tab').removeClass('selected');
        $(this).addClass('selected');
        $('.tab-content').hide().filter('.' + target).show();
        return false;
      });

      navigator.geolocation.watchPosition(function (e) {
        chat.me.lat = e.coords.latitude;
        chat.me.lng = e.coords.longitude;
        chat.socket.emit('update', chat.me);
      });
    }
    , log: function (msg) {
      $('#log').prepend(
        $('<li class="log-item "/>')
          .append(
            $('<span class="user-summary" />').text(msg.user.name)
          ).append(msg.el)
      );
    }
  };


  window.ChatClient = ChatClient;
});