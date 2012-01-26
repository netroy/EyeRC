// Imports
var    fs = require('fs'),
       io = require("socket.io"),
  express = require('express'),
  connect = require('connect'),
   stylus = require("stylus"),
   events = require('events'),
everyauth = require('everyauth'),
      app = express.createServer(),
   config = require("./config");

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(stylus.middleware({
    src: __dirname + '/src',
    dest: __dirname + '/static',
    compile: function (str, path, fn) {
      return stylus(str).set('filename', path).set('compress', true);
    }
  }));
  app.use(express.favicon(__dirname + '/static/favicon.ico'));

  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.session({
    key: config.sessions.key,
    secret: config.sessions.secret,
    cookie: {
      path: '/',
      httpOnly: true,
      maxAge: config.sessions.expires
    }
  }));
});

app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  app.use(express.methodOverride());
  app.use(express["static"](__dirname + '/static'));
});

app.configure('production', function() {
  app.use(express.errorHandler());
  app.enable('view cache');

  // Use gzippo to compress all text content
  app.use(require("gzippo").staticGzip(__dirname + '/static', {
    maxAge: 86400*365
  }));
});

app.configure(function() {
  app.use(everyauth.middleware());
  everyauth.helpExpress(app);
  app.use(app.router);
});



// Bind the routes

app.get("/", function(req, resp) {
  resp.render('newui.ejs', {
    "title": "IRC on the cloud",
    "nick": config.irc.nick,
    "name": config.irc.name
  });
});

app.get("/old", function(req,resp){
  resp.render('index.ejs',{
    title: 'IRC on the cloud',
    theme: 'aristo',
    nick: config.irc.nick,
    name: config.irc.name
  });
});

// Start listening
if (!module.parent) {
  io = io.listen(app);
  app.listen(process.env['app_port'] || config.http.port);
  console.info("server started at http://localhost:%d/", app.address().port);
}

var backlog = {};

// Initialize the message queue for posting
var mQueue = new events.EventEmitter();

// Bind Socket.IO server to the http server
io.set('log level', 2);
io.sockets.on('connection', function(client){
  mQueue.emit('connection', null);

  for(var channel in backlog) {
    if(channel === 'server') {
      client.json.send({'motd': backlog["server"]});
    } else {
      client.json.send({'channel':channel, topic:backlog[channel]["topic"]});
      client.json.send({'channel':channel, names:backlog[channel]["names"]});
      client.json.send({'message': backlog[channel]["messages"]});
    }
  }

  client.json.send({'backlog': true});

  client.on('message', function(message){
    mQueue.emit('message', message);
  });

  client.on('disconnect',function(){
    mQueue.emit('disconnect', null);
  });
});

var ircClient = require("./lib/ircClient").init(config.irc, io, backlog);

// For sending push to message queue
var msgObject, clientCount = 0, awayTimer;
mQueue.addListener('message', function(message){
  if(!!backlog[message.channel] && ircClient.conn.writable === true){
    ircClient.say(message.channel, message.text);
    msgObject = {
      from: config.irc.nick,
      channel: message.channel,
      text: message.text,
      time: (new Date()).toUTCString()
    };
    backlog[message.channel]["messages"].push(msgObject);
    io.sockets.json.send({'echo':msgObject});
  }
});

mQueue.addListener('connection', function(){
  clearTimeout(awayTimer);
  if(ircClient.conn.writable !== true) return;
  if(++clientCount === 1){
    awayTimer = setTimeout(function(){
      ircClient.away();
    },15000);
  }
});

mQueue.addListener('disconnect', function(){
  clearTimeout(awayTimer);
  if(ircClient.conn.writable !== true) return;
  if(--clientCount < 1){
    awayTimer = setTimeout(function(){
      ircClient.away(config.irc.awayMsg);
    },15000);
  }
});
