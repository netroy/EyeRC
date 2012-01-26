/*global require, console, exports*/

"use strict";

// Initialize the message queue for posting
var EventEmitter = require('events').EventEmitter;
var mQueue = new EventEmitter();

var config, backlog, io, ircClient, msgObject, clientCount = 0, awayTimer;

function onClientMessage(message) {
  mQueue.emit('message', message);
}


function onClientDisconnect() {
  mQueue.emit('disconnect', null);
}


function onClientConnect(client) {
  mQueue.emit('connection', null);

  for(var channel in backlog) {
    var channelObj = backlog[channel];
    if(channel === 'server') {
      client.json.send({
        'motd': channelObj
      });
    } else {
      client.json.send({
        'channel': channel,
        "topic": channelObj["topic"]
      });
      client.json.send({
        'channel': channel,
        "names": channelObj["names"]
      });
      client.json.send({
        'message': channelObj["messages"]
      });
    }
  }

  client.json.send({
    'backlog': true
  });

  client.on('message', onClientMessage);
  client.on('disconnect', onClientDisconnect);
}


function onMessage(message) {
  var channel = message.channel;
  var channelObj = backlog[channel];
  if(!!channelObj && ircClient.conn.writable === true){
    ircClient.say(channel, message.text);
    msgObject = {
      from: config.nick,
      channel: channel,
      text: message.text,
      time: (new Date()).toUTCString()
    };
    channelObj["messages"].push(msgObject);
    io.sockets.json.send({
      'echo': msgObject
    });
  }
}


function onConnect() {
  clearTimeout(awayTimer);
  if(ircClient.conn.writable !== true) return;
  if(++clientCount === 1){
    awayTimer = setTimeout(function(){
      ircClient.away();
    }, 15000);
  }
}


function onDisconnect() {
  clearTimeout(awayTimer);
  if(ircClient.conn.writable !== true) return;
  if(--clientCount < 1){
    awayTimer = setTimeout(function(){
      ircClient.away(config.awayMsg);
    }, 15000);
  }
}


exports.init = function init(_config, _io, _backlog, _ircClient) {
  config = _config;
  io = _io;
  backlog = _backlog;
  ircClient = _ircClient;

  // Bind Socket.IO server to the http server
  io.sockets.on('connection', onClientConnect);

  // For sending push to message queue
  mQueue.addListener('message', onMessage);
  mQueue.addListener('connection', onConnect);
  mQueue.addListener('disconnect', onDisconnect);

  return mQueue;
};