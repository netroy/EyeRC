var  fs = require('fs'),
     io = require("socket.io"),
    irc = require("irc"),
express = require('express'),
connect = require('connect'),
 events = require('events');
    app = express.createServer();

var  port = 10023,
   server = "chat.freenode.net"
 channels = ["##javascript", "#html5", "#Node.js", "#jquery", "#css", "#nginx"],
     nick = "AsDfGh123", //"NetRoY",
     pass = "IAmAdi123",
  MAX_LOG = 100;

"use strict";

app.configure(function(){
  app.use(express.bodyParser());
  app.use(express.logger());
  app.use(app.router);
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  app.use(connect.responseTime());
  app.use(connect.favicon());
  app.use(express.static(__dirname + '/static'));
});

app.get("/", function(req,res){
  res.render('index.ejs');
});
app.listen(10023);

var backlog = {};
try{
  fs.readFile(__dirname + "/dump.json", function(err, data){
    if(err) return;
    data = data.toString();
    if(data.length > 100) {
      backlog = JSON.parse("("+data+")");
    }
  });
}catch(e){}

var mQueue = new events.EventEmitter;
var socket = io.listen(app);
socket.on('connection', function(client){ 
  console.log("connected");
  client.send({backlog: backlog});
  client.on('message', function(message){
    mQueue.emit('message',message);
  });
  client.on('disconnect',function(){
    console.log("disconnectd");
  });
});

console.log("server started at http://127.0.0.1:10023/");
/*
(function dumpBackLog(){
  var dump = JSON.stringify(backlog);
  if(dump.length < 100) setInterval(dumpBackLog,60*1000);
  else fs.writeFile(__dirname + "/dump.json", dump, function (err) {
    if(!err) setInterval(dumpBackLog,30*1000);
  });
})();
*/

/*
 * API: https://github.com/martynsmith/node-irc/blob/master/API.md
 */
var ircClient = new irc.Client(server, nick, {
  channels: [],
  userName: nick,
  realName: nick,
  password: pass,
  autoRejoin: true
});
ircClient.addListener('registered', function(){
  console.log("IRC server '"+server+"' connected");
  channels.forEach(function(channel){
    (function(channel){
      ircClient.join(channel,function(nick){
        console.log("Joined " + channel + " as " + nick);
      });
    })(channel);  
    backlog[channel] = {"topic": "", "names": null, "messages": []};
  });
});

ircClient.addListener('names', function(channel, nicks){
  if(!!backlog[channel]){
    backlog[channel]["names"] = nicks;
    socket.broadcast({channel:channel, names:nicks});
  }else console.log(arguments);
});
ircClient.addListener('topic', function(channel, topic, nick){
  if(!!backlog[channel]){
    backlog[channel]["topic"] = topic;
    socket.broadcast({channel:channel, topic:topic});
  }else console.log(arguments);
});
ircClient.addListener('join', function(channel, nick){
  socket.broadcast({channel:channel, join:nick});
});
ircClient.addListener('part', function(channel, nick){
  socket.broadcast({channel:channel, part:nick});
});
ircClient.addListener('message', function (from, to, text) {
  var now = new Date();
  var packet = {from: from, to: to, text: text, time: now.toUTCString()};
  if(!!backlog[to] && to.indexOf("#") === 0){
    var clog = backlog[to]["messages"];
    clog.push(packet);
    if(clog.length > MAX_LOG) clog.shift();    
  }else console.log(packet);
  socket.broadcast({message:packet});
});
mQueue.addListener('message', function(message){
  if(!!backlog[message.channel]){
    console.log(message)
    ircClient.say(message.text);
  }
});
