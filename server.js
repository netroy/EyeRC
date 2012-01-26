// Imports
var    fs = require('fs'),
   config = require("./config"),
  express = require('express'),
  connect = require('connect'),
   stylus = require("stylus"),
everyauth = require('everyauth'),
      app = express.createServer();

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
  app.listen(process.env['app_port'] || config.http.port);
  console.info("server started at http://localhost:%d/", app.address().port);
}

var backlog = {};
var io = require("socket.io");
io = io.listen(app);
io.set('log level', 2);
var ircClient = require("./lib/ircClient").init(config.irc, io, backlog);
var mQueue = require("./lib/messageQueue").init(config.irc, io, backlog, ircClient);
