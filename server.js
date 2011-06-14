"use strict";
// Imports
var    fs = require('fs'),
       io = require("socket.io"),
      irc = require("irc"),
  express = require('express'),
  connect = require('connect'),
   events = require('events'),
     auth = require('connect-auth'),
      app = express.createServer(),
   config = require("./config").config;

   process.on('SIGINT', function () {
     console.log('Got SIGINT.  Press Control-D to exit.');
   });

app.configure(function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  app.use(express.static(__dirname + '/static'));
  app.use(connect.cookieParser());
  app.use(connect.session({ secret: 'fhwoerjhcuenacjes', cookie: {maxAge: 60000} }));
  app.use(auth([
    auth.Twitter({
      callback: "http://127.0.0.1:"+config.http.port+"/login",
      consumerKey: config.twitter.key,
      consumerSecret: config.twitter.secret
    })
  ]));
  app.use(connect.favicon());
  app.use(app.router);
});

// Bind the routes
app.get("/", function(req,resp){
  resp.render('index.ejs',{
    title: 'IRC on the cloud',
    theme: 'aristo',
    user: req.session.auth.user || {},
    nick: config.irc.nick,
    name: config.irc.name
  });
});
app.get("/login", function(req,resp){
  try{
    req.authenticate(['twitter'], function(error, authenticated) {
      if(error){
        resp.send(JSON.stringify(error));
        resp.render('error.ejs',{title:"Some error occured",error:error});
      }else if(authenticated){
        resp.redirect("/");
      }
    });
  }catch(e){
    resp.render('error.ejs',{title:"Some error occured",error:e.stack});
  }
});
app.get("/logout",function(req,resp){
  req.session.destroy();
  resp.redirect("/");
});

// Start listening
if (!module.parent) {
  app.listen(config.http.port);
  console.log("server started at http://127.0.0.1:10023/");
}

var backlog = {};

// Initialize the message queue for posting
var mQueue = new events.EventEmitter;

// Bind Socket.IO server to the http server
var socket = io.listen(app, {log:function(){}});
socket.on('connection', function(client){ 
  console.log("connected");
//  client.send({backlog: backlog});
  for(var channel in backlog){
    if(channel === 'server'){
      
    }else{
      ircClient.emit('topic', channel, backlog[channel]["topic"], config.irc.nick);
      ircClient.emit('names', channel, backlog[channel]["names"]);
      var messages = backlog[channel]["messages"];
      messages.forEach(function(message){
        ircClient.emit('message', message.from, message.channel, message.text, message.time);
      });
    }
  }
  client.on('message', function(message){
    mQueue.emit('message',message);
  });
  client.on('disconnect',function(){
    console.log("disconnectd");
  });
});

// API: https://github.com/martynsmith/node-irc/blob/master/API.md
var ircClient = new irc.Client(config.irc.server, config.irc.nick, {
  channels: [],
  userName: config.irc.nick,
  realName: config.irc.name,
  password: config.irc.pass,
  autoRejoin: true
});

ircClient.addListener('registered', function(){
  console.log("IRC server '"+config.irc.server+"' connected");
  backlog["server"] = [];
  config.irc.channels.forEach(function(channel){
    (function(channel){
      ircClient.join(channel,function(nick){
        console.log("Joined " + channel + " as " + nick);
      });
    })(channel);  
    backlog[channel] = {"topic": "", "names": null, "messages": []};
  });
});

ircClient.addListener('motd', function(message){
  message.split(/[\r\n]+/).forEach(function(m){
    socket.broadcast({motd: m});
    backlog["server"].push(m);
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

ircClient.addListener('message', function (from, channel, text, time) {
  var packet = {from: from, channel: channel, text: text, time: (time || (new Date()).toUTCString())};
  if(!time && !!backlog[channel] && channel.indexOf("#") === 0){
    var clog = backlog[channel]["messages"];
    clog.push(packet);
    if(clog.length > config.MAX_LOG) clog.shift();    
  }
  socket.broadcast({message:packet});
});

ircClient.addListener('raw', function(message){
  //console.log(JSON.stringify(message));
});



// For sending push to message queue
mQueue.addListener('message', function(message){
  if(!!backlog[message.channel] && ircClient.conn.connected === true){
    ircClient.say(message.channel, message.text);
    backlog[message.channel]["messages"].push({
      from: config.irc.nick, 
      channel: message.channel, 
      text: message.text, 
      time: (new Date).toUTCString()
    });
  }
});


// Clean Up before Exit
process.on('exit', function cleanUp() {
  // Try to dump JSON of the backlog
  fs.writeFile(__dirname + "/dump.json", JSON.stringify(backlog), function(err){
    if(!err) console.log("Failed to dump the Back Log");
  });

  console.log("\n\nCleaning up before quiting");
  
  // Disconnect from all all channels & then close the connection
  config.irc.channels.forEach(function(channel){
    (function(channel){
      ircClient.part(channel,function(nick){
        console.log("Left " + channel);
      });
    })(channel);
  });
  ircClient.disconnect("Shutting down the client");
});

process.on('SIGINT',function(){
  process.exit(0);
});
