/*global require, console, exports*/

"use strict";

var irc = require("irc");
var config, io, backlog, ircClient;

// API: https://github.com/martynsmith/node-irc/blob/master/API.md
irc.Client.prototype.away = function(message){
  if(typeof message !== 'undefined'){
    this.send('AWAY',message);
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
    backlog[channel] = {"topic": "", "names": [], "messages": []};
  });
}


function handleMOTD(message) {
  message = message.split(/[\r\n]+/);
  io.send({
    motd: message
  });
  backlog["server"] = backlog["server"] || [];
  Array.prototype.push.apply(backlog["server"], message);
}


function handleNameLists(channel, nicks) {
  if(!!backlog[channel]){
    backlog[channel]["names"] = nicks;
    io.send({
      "channel": channel,
      "names": nicks
    });
  }
}


function handleTopic(channel, topic, nick){
  if(!!backlog[channel]){
    backlog[channel]["topic"] = topic;
    io.send({
      "channel": channel,
      "topic": topic
    });
  }
}


function handleJoin(channel, nick) {
  if(!!backlog[channel]){
    backlog[channel]["names"][nick] = '';
    io.send({
      "channel": channel,
      "join": nick
    });
  }
}


function handlePart(channel, nick) {
  if(!!backlog[channel]){
    delete backlog[channel]["names"][nick];
    io.send({
      "channel": channel,
      "part": nick
    });
  }
}


function handleMessage(from, channel, text, time) {
  var packet = {
    "from": from,
    "channel": channel,
    "text": text,
    "time": (time || (new Date()).toUTCString())
  };

  if(!time && !!backlog[channel] && channel.indexOf("#") === 0){
    var clog = backlog[channel]["messages"];
    clog.push(packet);
    if(clog.length > config.MAX_LOG) clog.shift();
  }

  io.send({
    "message": packet
  });
}


exports.init = function init(_config, _io, _backlog) {
  config = _config;
  io = _io.sockets.json;
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
