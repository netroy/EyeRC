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

app.configure(function(){
  app.use(express.static(__dirname + '/static'));
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
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

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
  app.use(express.methodOverride());
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
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
  app.listen(process.env['app_port'] || config.http.port);
  console.info("server started at http://localhost:%d/",app.address().port);
}

var backlog = {};

// Initialize the message queue for posting
var mQueue = new events.EventEmitter;

// Bind Socket.IO server to the http server
var io = io.listen(app);
io.set('log level', 2);
io.sockets.on('connection', function(client){
  mQueue.emit('connection', null);

  for(var channel in backlog){
    if(channel === 'server'){
      client.json.send({'motd': backlog["server"]});
    }else{
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

// API: https://github.com/martynsmith/node-irc/blob/master/API.md
irc.Client.prototype.away = function(message){
  if(typeof message !== 'undefined'){
    this.send('AWAY',message);
    this.send('NICK', this.opt.nick+"|away");
    console.info("Gone away");
  }else{
    this.conn.write("AWAY \r\n");
    this.send('NICK', this.opt.nick);
    console.info("Came back");
  }
}
var ircClient = new irc.Client(config.irc.server, config.irc.nick, {
  channels: [],
  userName: config.irc.nick,
  realName: config.irc.name,
  password: config.irc.pass,
  autoRejoin: true
});

console.info("Connecting to freenode");

ircClient.addListener('registered', function(){
  console.log("IRC server '"+config.irc.server+"' connected");
  backlog["server"] = [];
  config.irc.channels.forEach(function(channel){
    (function(channel){
      ircClient.join(channel,function(nick){
        console.info("Joined " + channel + " as " + nick);
      });
    })(channel);  
    backlog[channel] = {"topic": "", "names": [], "messages": []};
  });
});

ircClient.addListener('motd', function(m){
  m = m.split(/[\r\n]+/);
  io.sockets.json.send({motd: m});
  backlog["server"] = backlog["server"] || [];
  Array.prototype.push.apply(backlog["server"],m);
});

ircClient.addListener('names', function(channel, nicks){
  if(!!backlog[channel]){
    backlog[channel]["names"] = nicks;
    io.sockets.json.send({channel:channel, names:nicks});
  }
});

ircClient.addListener('topic', function(channel, topic, nick){
  if(!!backlog[channel]){
    backlog[channel]["topic"] = topic;
    io.sockets.json.send({channel:channel, topic:topic});
  }else console.log(arguments);
});

ircClient.addListener('join', function(channel, nick){
  if(!!backlog[channel]){
    backlog[channel]["names"][nick] = '';
    io.sockets.json.send({channel:channel, join:nick});
  }
});

ircClient.addListener('part', function(channel, nick){
  if(!!backlog[channel]){
    delete backlog[channel]["names"][nick];
    io.sockets.json.send({channel:channel, part:nick});
  }
});

ircClient.addListener('message', function (from, channel, text, time) {
  var packet = {from: from, channel: channel, text: text, time: (time || (new Date()).toUTCString())};
  if(!time && !!backlog[channel] && channel.indexOf("#") === 0){
    var clog = backlog[channel]["messages"];
    clog.push(packet);
    if(clog.length > config.MAX_LOG) clog.shift();    
  }
  io.sockets.json.send({message:packet});
});

// For sending push to message queue
var msgObject, clientCount = 0, awayTimer;
mQueue.addListener('message', function(message){
  if(!!backlog[message.channel] && ircClient.conn.writable === true){
    ircClient.say(message.channel, message.text);
    msgObject = {
      from: config.irc.nick, 
      channel: message.channel, 
      text: message.text, 
      time: (new Date).toUTCString()
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

/*
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
*/
