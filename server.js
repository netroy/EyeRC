/*global require, console, exports, __dirname, module, process*/

"use strict";

// Imports
var    fs = require('fs'),
   config = require("./config"),
  express = require('express'),
  connect = require('connect'),
   stylus = require("stylus"),
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

  app.use(app.router);
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


// Bind the routes
var ircConfig = config.irc;

app.get("/", function(req, resp) {
  resp.render('newui.ejs', {
    "title": "IRC on the cloud",
    "nick": ircConfig.nick,
    "name": ircConfig.name
  });
});

app.get("/old", function(req,resp) {
  resp.render('index.ejs',{
    title: 'IRC on the cloud',
    theme: 'aristo',
    nick: ircConfig.nick,
    name: ircConfig.name
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
var ircClient = require("./lib/ircClient").init(ircConfig, io, backlog);
var mQueue = require("./lib/messageQueue").init(ircConfig, io, backlog, ircClient);
