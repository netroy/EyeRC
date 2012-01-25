(function($, window, io, undefined) {

  "use strict";

  var socket, sidebar, panel, title, channelMap = {}, currentChannel;
  var console = window.console || {log:function(){}};

  function render(template, data) {
    return template.replace(/\{\{[\w\.\-\(\)]+\}\}/g, function(match){
      var token = match.replace(/[\{\}]/g,"");
      try {
        return (new Function("data", "return data." + token))(data);
      } catch(e) {
        return "";
      }
    });
  }

  function pretty(a, b, c){
    a = ((new Date())-(new Date(a)))/1000;
    for(b=[60,60,24],c=0;a>b[c];a/=b[c++]);
    a = ~~a;
    return (c===0 && a < 10)?"now":(a+" "+"sec0min0hour0day".split(0)[c]+(a>1?"s":"")+" ago");
  }

  function prettyTime(){
    $("time").each(function(){
      $(this).html(pretty($(this).attr("data")));
    });
    $("section i").remove();
  }

  setInterval(prettyTime,60*1000);

  var entities = {"<":"&lt;",">":"&gt;",'&':'&amp;','"':'&quot;',"'": '&#32;'};
  function linkify(text) {
    if(!text) return '';
    text = text.replace(/[&"'><]/g,function(match){
      return entities[match];
    });
    text = text.replace(/((https?):\/\/([\-\w\.]+)+(:\d+)?(\/([\w\/_\.\-#\+]*(\?\S+)?)?)?)/gm,'<a href="$1" target="_blank">$1</a>');
    text = text.replace(/^\@?([\w]*):/,function(match){return (match==='http')?match:match.bold();});
    return text;
  }

  function connected() {
    console.log("socket connected");
  }

  function getChannel(name) {
    if(!(name in channelMap)) {
      var channel = channelMap[name] = {
        name: name,
        unread: 0
      };

      var newTab = $("<li rel='"+name+"'>"+name+"</li>");
      sidebar.find("ul.server").append(newTab);

      channel.messages = $("<div class='log'></div>");
      channel.users = $("<ol class='users'></ol>");
      channel.tab = newTab;

      if(name === currentChannel) {
        channel.tab.trigger("click");
      }
    }
    return channelMap[name];
  }

  function initChannelMenu() {
    sidebar.delegate("li", "click", function(e) {
      var node = $(e.currentTarget);
      if(!node.hasClass("console") && !node.hasClass("selected")) {
        node.parent("ul.server").find("li.selected").removeClass("selected");
        node.addClass("selected").removeClass("highlight").find("sup").remove();
        var name = node.attr("rel");
        var channel = channelMap[name];
        channel.unread = 0;
        title.html(linkify(channel.topic));
        $("div.log", panel).replaceWith(channel.messages);
        channel.messages.niceScroll();
        prettyTime();
        $("ol.users", panel).replaceWith(channel.users);
        currentChannel = name;
        localStorage.setItem("currentChannel", name);
      }
    });
  }

  var partial = "<p><u>{{from}}</u><time data='{{time}}'>{{ftime}}</time><span>{{text}}</span></p>";
  var userNick = window.EYERC.nick.toLowerCase();
  function initWSConnection() {
    socket = io.connect();
    socket.on('connect', connected);
    socket.on('message', function(msg) {
      var channel;
      if(msg.channel) {
        channel = getChannel(msg.channel);
        if(msg.topic) {
          channel.topic = msg.topic;
          if(currentChannel === msg.channel) {
            title.html(linkify(msg.topic));
          }
        }

        if(msg.names) {
          channel.names = msg.names;
          var users = channel.users;
          users.empty();
          for(var nick in msg.names){
            users.append("<li><u>"+nick+"</u></li>");
          }
        }
      } else if(msg.message) {
        msg = msg.message;
        if(!(msg instanceof Array)) {
          msg = [msg];
        }

        for(var i = 0, len = msg.length, m; i < len; i++) {
          m = msg[i];
          channel = getChannel(m.channel);
          m.text = linkify(m.text);
          m.ftime = pretty(m.time);
          channel.messages.prepend(render(partial,m));
          if(currentChannel !== channel.name) {
            channel.unread++;
            var tab = channel.tab;
            var sup = tab.find("sup");
            if(sup.length > 0) {
              sup.html(channel.unread);
            } else {
              tab.append("<sup>"+channel.unread+"</sup");
            }
            if(!!m.text.toLowerCase().match(userNick)) {
              tab.addClass("highlight");
            }
          }
        }
      } else if(msg.join || msg.part) {
        
      }
    });
  }

  function init() {

    sidebar = $("#SideBar");
    panel = $("#Panel");
    title = $("header .title");

    currentChannel = localStorage.getItem("currentChannel");
    initChannelMenu();

    initWSConnection();
  }

  $(init);

})(jQuery, window, io);
