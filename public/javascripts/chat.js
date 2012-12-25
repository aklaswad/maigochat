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

  // Function takes dataurl and give resized dataurl to callback
  var _resizeImage = function (data, to_width, cb, infocb) {
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
      infocb('sending...');
      cb(canvas.toDataURL('image/jpeg'));
    }).attr('src', data);
  };

  // Function takes file and give resized dataurl to callback
  var resizeImage = function ( file, size, cb, infocb) {
    var intermediate = size;
    while ( intermediate < 1024 ) {
      intermediate *= 2;
    }
    infocb('loading image...');
    canvasResize(file, {
      width: intermediate,
      height: 0,
      crop: false,
      quality: 100,
      callback: function(data) {
        infocb('compressing...');
        _resizeImage(data, size, cb, infocb);
      }
    });
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
      this.roomurl = opts.roomurl;
      this.roomid = opts.roomid;
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
          var $el = $('<div class="img-log "/>');
          $('<img class="img-log-img" />').attr('src', msg.photo).appendTo($el);
          $('<a href="#" class="img-draw"></a>').appendTo($el);
          chat.log({ user: msg.user, el: $el });
        }
      });
      socket.on('welcome', function (msg) {
        msg.users[ msg.you.id ].me = true;
        chat.me = msg.you;
        $('#name').val(msg.you.name);
        chat.users.init(msg.users);
        setInterval( function () {
          navigator.geolocation.getCurrentPosition(function (e) {
            chat.me.lat = e.coords.latitude;
            chat.me.lng = e.coords.longitude;
            chat.socket.emit('update', chat.me);
          }, function () {

          });
        }, 10000);
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
        $('#text').val('');
        return false;
      });

      $('.username').live('click',function () {
        chat.users.follow({ id: $(this).attr('data-uid') });
        return false;
      });

      $('#config-open').click( function () {
        $('#config').show(200);
        $('#log').hide();
      });

      $('#config-close').click( function () {
        $('#config').hide(200);
        $('#log').show();
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
        resizeImage( e.target.files[0], 320, function (resized) {
          chat.socket.emit('message', {'photo': resized});
          $input.val('');
          chat.info('done');
        }, function(info) { chat.info(info, 100000); } );
        return false;
      });
      $('.img-draw').live('click', function () {
        var img = $(this).parent('.img-log').find('img').get(0);
        chat.draw(img);
      });
      $(window).bind('resize', function () {
        if ( !$('#draw:visible').length) return;
        chat.imageDraw.fixSize();
      });

      this.imageDraw = new ImageDraw({canvas: $('#canvas').get(0) });
      $('.draw-cmd').click(function () {
        var $this = $(this);
        var cmd = $this.attr('data-draw-cmd');
        if ( $this.is('.cmd-color') ) {
          $('.cmd-color').removeClass('cmd-selected');
          $this.addClass('cmd-selected');
          if ( !cmd ) {
            cmd = 'color ' + $this.css('background-color').replace(/ /g,'');
          }
        }
        if ( $this.is('.cmd-size') ) {
          $('.cmd-size').removeClass('cmd-selected');
          $this.addClass('cmd-selected');
        }
        chat.imageDraw.command(cmd);
      });
      $('#draw-post').click(function () {
        chat.socket.emit('message', { photo: chat.imageDraw.toDataURL() });
        $('#draw').hide();
      });
      $('#draw-cancel').click(function () {
        $('#draw').hide();
      });

      // ------------ Invite
      var twitterIconInterval;
      $('#twitter-id').keyup( function () {
        if ( twitterIconInterval ) {
          clearInterval( twitterIconInterval );
        }
        var id = $(this).val().replace(/\s/g, '');
        if ( id.length === 0 ) {
          $('#twitter-icon').attr('src','about:blank');
          return;
        }
        var url = 'http://api.twitter.com/1/users/profile_image?size=normal&screen_name=' + id;
        twitterIconInterval = setInterval(function () {
          $('#twitter-icon').attr('src',url);
          clearInterval( twitterIconInterval );
          twitterIconInterval = null;
        }, 500);
      });
      $('#twitter-invite').click( function () {
        var id = $('#twitter-id').val().replace(/\s/g, '');
        var url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent('d ' + id +  ' could you tell me the way to?') + '&url=' + encodeURIComponent(chat.roomurl);
        window.open(url);
      });
    }
    , info: function (msg, len) {
      if ( this.timer ) {
        clearInterval(this.timer);
      }
      $('#info').text(msg).show();
      this.timer = setInterval( function () {
        $('#info').text('').hide(200);
      }, len || 2000);
    }
    , log: function (msg) {
      $('#log').prepend(
        $('<li class="log-item "/>')
          .append(
            $('<div class="user-summary" />').text(msg.user.name)
          ).append(msg.el)
      );
    }
    , draw: function(img) {
      $('#draw').show();
      var imageDraw = this.imageDraw;
      // Hack to get original image size
      var tmp = $('<img />').one('load', function () {
        var w = tmp.get(0).width, h = tmp.get(0).height;
        var bg = $('#draw-bg').one('load', function () {
          imageDraw.setBackground(bg.get(0), w, h);
          imageDraw.fixSize();
        }).attr('src', img.src);
      }).attr('src', img.src);
    }
  };


  var ImageDraw = function (opts) {
    return this.init(opts);
  };

  ImageDraw.prototype = {
    init: function (opts) {
      this.canvas = opts.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.bindHandler();
    }
    , fixSize: function () {
      var w = $('#draw').width();
      var h = $('#draw').height() - $('#draw-control').height() - 4;
      var css = {};
      if ( w / h > this.width / this.height ) {
        css.width = h * this.width / this.height;
        css.height = h;
      }
      else {
        css.width = w;
        css.height = w * this.height / this.width;
      }
      $('#canvas').css(css);
      $('#draw-bg').css(css);
    }
    , bindHandler: function () {
      var $canvas = $(this.canvas);
      var draw = this;
      $canvas.bind('touchstart mousedown', function (e) {
        draw.touchstart(e); return false;
      })
      .bind('touchmove mousemove', function (e) {
        draw.touchmove(e); return false;
      })
      .bind('touchend mouseup', function (e) {
        draw.touchend(e); return false;
      });
    }
    , __pos: function (e) {
      var x = e.offsetX || e.originalEvent.pageX - $(this.canvas).offset().left,
          y = e.offsetY || e.originalEvent.pageY - $(this.canvas).offset().top;
      return {
        x: x * this.canvas.width/$(this.canvas).width() ,
        y: y * this.canvas.height/$(this.canvas).height()
      };
    }
    , touchstart: function (e) {
      var pos = this.last = this.__pos(e);
      this.ctx.beginPath();
      this.ctx.arc(
        pos.x,
        pos.y,
        this.ctx.lineWidth / 2.0,
        0,
        Math.PI*2,
        false
      );
      this.ctx.fill();
      this.ctx.closePath();
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x);
      this.drawing = true;
      this.touchmove(e);
    }
    , touchmove: function (e) {
      if ( !this.drawing ) return;
      var pos = this.__pos(e);
      this.ctx.lineTo(pos.x,pos.y);
      this.ctx.stroke();
      this.last = pos;
    }
    , touchend: function (e) {
      this.drawing = false;
      this.ctx.closePath();
    }
    , setBackground: function(img,w,h) {
      this.bg = img;
      this.width = w;
      this.height = h;
      this.canvas.width = img.width;
      this.canvas.height = img.height;
    }
    , command: function (str) {
      var args = str.split(/\s+/);
      var command = args.shift();
      this[command].apply(this, args);
    }
    , clear: function () {
      this.ctx.clearRect(0,0,this.canvas.width, this.canvas.height);
    }
    , color: function (color) {
      if ( color === 'eraser' ) {
        this.ctx.globalCompositeOperation = 'destination-out';
      }
      else {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = this.ctx.strokeStyle = color;
      }
    }
    , size: function (size) {
      this.ctx.lineWidth = size;
    }
    , toDataURL: function () {
      var master = $('<canvas />').attr({
        width: this.width,
        height: this.height
      }).get(0);
      var ctx = master.getContext('2d');
      ctx.drawImage(this.bg, 0,0);
      ctx.drawImage(
        this.canvas,
        0, 0, this.canvas.width, this.canvas.height,
        0, 0, this.width,        this.height
      );
      return master.toDataURL('image/jpen');
    }
  };

  window.ChatClient = ChatClient;
});