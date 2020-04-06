/*global require, console, exports, __dirname, module, process*/

"use strict";

const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const stylus = require("stylus");

const config = require("./config");

const app = express();
const server = http.Server(app);
const io = socketIO(server);

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(stylus.middleware({
  src: __dirname + '/src',
  dest: __dirname + '/static',
  compile: (str, path) => stylus(str).set('filename', path).set('compress', true)
}));
app.use(express.static(path.resolve(__dirname, 'static')))

app.get("/", function(req, resp) {
  resp.render('newui.ejs', {
    "title": "IRC on the cloud",
    "nick": config.irc.nick,
    "name": config.irc.name
  });
});

// Start listening
if (!module.parent) {
  const port = process.env['app_port'] || config.http.port
  server.listen(port);
  console.info("server started at http://localhost:%d/", port);
}

var backlog = {};
var ircClient = require("./lib/ircClient").init(config.irc, io, backlog);
require("./lib/messageQueue").init(config.irc, io, backlog, ircClient);
