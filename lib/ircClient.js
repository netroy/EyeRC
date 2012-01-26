/*global require, console, exports*/

"use strict";

var irc = require("irc");
var config, io, backlog, ircClient;

// API: https://github.com/martynsmith/node-irc/blob/master/API.md
irc.Client.prototype.away = function(message){
  if(typeof message !== 'undefined'){
    this.send('AWAY', message);
    //this.send('NICK', this.opt.nick+"|away");
    console.info("Gone away");
  } else {
    this.conn.write("AWAY \r\n");
    //this.send('NICK', this.opt.nick);
    console.info("Came back");
  }
};


function onRegister() {
  console.log("IRC server '"+config.server+"' connected");
  backlog["server"] = [];
  config.channels.forEach(function(channel) {
    backlog[channel] = {
      "topic": "",
      "names": [],
      "messages": []
    };
  });
}


function handleMOTD(message) {
  message = message.split(/[\r\n]+/);
  backlog["server"] = backlog["server"] || [];
  Array.prototype.push.apply(backlog["server"], message);
  io.sockets.emit("motd", message);
}


function handleNameLists(channel, nicks) {
  var channelObj = backlog[channel];
  if(!!channelObj) {
    channelObj["names"] = nicks;
    io.sockets.emit("names", {
      "channel": channel,
      "names": nicks
    });
  }
}


function handleTopic(channel, topic, nick){
  var channelObj = backlog[channel];
  if(!!channelObj) {
    channelObj["topic"] = topic;
    io.sockets.emit("topic", {
      "channel": channel,
      "topic": topic
    });
  }
}


function handleJoin(channel, nick) {
  var channelObj = backlog[channel];
  if(!!channelObj){
    channelObj["names"][nick] = '';
    io.sockets.emit("join", {
      "channel": channel,
      "join": nick
    });
  }
}


function handlePart(channel, nick) {
  var channelObj = backlog[channel];
  if(!!channelObj){
    delete channelObj["names"][nick];
    io.sockets.emit("part", {
      "channel": channel,
      "part": nick
    });
  }
}


function handleMessage(from, channel, text, time) {
  var channelObj = backlog[channel];
  var packet = {
    "from": from,
    "channel": channel,
    "text": text,
    "time": (time || (new Date()).toUTCString())
  };

  if(!time && !!channelObj && channel.indexOf("#") === 0){
    var clog = channelObj["messages"];
    clog.push(packet);
    if(clog.length > config.MAX_LOG) clog.shift();
  }

  io.sockets.emit("messages", packet);
}


exports.init = function init(_config, _io, _backlog) {
  config = _config;
  io = _io;
  backlog = _backlog;

  ircClient = new irc.Client(config.server, config.nick, {
    channels: config.channels,
    userName: config.nick,
    realName: config.name,
    password: config.pass,
    autoRejoin: true
  });

  console.info("Connecting to freenode");

  ircClient.addListener('registered', onRegister);
  ircClient.addListener('motd',  handleMOTD);
  ircClient.addListener('names', handleNameLists);
  ircClient.addListener('topic', handleTopic);
  ircClient.addListener('join',  handleJoin);
  ircClient.addListener('part',  handlePart);
  ircClient.addListener('message', handleMessage);

  return ircClient;
};
