(function($, window, io, undefined) {

  "use strict";

  var win, doc;
  var socket, sidebar, sidebarLinks, panel, title, channelMap = {}, currentChannel;
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

  setInterval(prettyTime, 60*1000);

  var entities = {"<":"&lt;",">":"&gt;",'&':'&amp;','"':'&quot;',"'": '&#0039;'};
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

  function selectChannel(e) {
    var node;
    if(e instanceof $.Event) {
      node = $(e.currentTarget);
    } else if (typeof e === "number"){
      node = sidebarLinks[e];
    }

    if(node === undefined) {
      return;
    }

    if(!node.hasClass("console") && !node.hasClass("selected")) {
      node.parent("ul.server").find("li.selected").removeClass("selected");
      node.addClass("selected").removeClass("highlight").find("sup").remove();

      var name = node.attr("rel");
      var channel = channelMap[name];
      channel.unread = 0;
      title.html(linkify(channel.topic));
      $("div.log", panel).replaceWith(channel.messages);
      prettyTime();

      $("ol.users", panel).replaceWith(channel.users);
      currentChannel = name;
      localStorage.setItem("currentChannel", name);
    }
  }

  var partial = "<p><u>{{from}}</u><time data='{{time}}'>{{ftime}}</time><span>{{text}}</span></p>";
  var userNick = window.EYERC.nick.toLowerCase();
  var backLogged = false;
  function initWSConnection() {
    socket = io.connect();
    socket.on('connect', connected);

    socket.on("topic", function handleTopic(msg) {
      var channel = getChannel(msg.channel);
      channel.topic = msg.topic;
      if(currentChannel === msg.channel) {
        title.html(linkify(msg.topic));
      }
    });

    socket.on("names", function handleNames(msg) {
      var channel = getChannel(msg.channel);
      channel.names = msg.names;
      var users = channel.users;
      users.empty();
      for(var nick in msg.names) {
        users.append("<li><u>"+nick+"</u></li>");
      }
    });

    socket.on("echo", function handleEcho(msg) {
      var channel = getChannel(msg.channel);
      msg.text = linkify(msg.text);
      msg.ftime = pretty(msg.time);
      channel.messages.prepend(render(partial, msg));
    });

    socket.on("messages", function handleMessages(msg) {
      var channel, tab, sup;
      if(!(msg instanceof Array)) {
        msg = [msg];
      }

      for(var i = 0, len = msg.length, m; i < len; i++) {
        m = msg[i];
        channel = getChannel(m.channel);
        m.text = linkify(m.text);
        m.ftime = pretty(m.time);
        channel.messages.prepend(render(partial,m));
        if(!backLogged) {
          continue;
        }

        // Increment the unread marker
        if(currentChannel !== channel.name) {
          channel.unread++;
          tab = channel.tab;
          sup = tab.find("sup");
          if(sup.length > 0) {
            sup.html(channel.unread);
          } else {
            tab.append("<sup>"+channel.unread+"</sup");
          }
        }
      
        // Highlight on mention
        if(currentChannel !== channel.name) {
          if(!!m.text.toLowerCase().match(userNick)) {
            tab.addClass("highlight");
          }
        }
      
        // TODO: For Hidden/Background-page flash the document title & show notification if possible
        // http://www.html5rocks.com/en/tutorials/notifications/quick/
        // https://developer.mozilla.org/en/DOM/Using_the_Page_Visibility_API
      }
    });

    socket.on("join", function handleJoin(msg) {
      
    });
  
    socket.on("part", function handlePart(msg) {
      
    });

    socket.on("backlog", function(msg) {
      backLogged = true;
    });

    socket.on('message', function(msg) {
      console.log(msg);
    });
  }

  function bindKeys() {
    doc.keydown(function(e) {
      if(e.ctrlKey) {
        if(!!String.fromCharCode(e.keyCode).match(/[0-9]/)) {
          // Ctrl+0-9 -> select channel
          selectChannel(e.keyCode - 48);
          e.preventDefault();
        } else if(e.keyCode == 37) {
          // Move to last tab
        } else if(e.keyCode == 39) {
          // Move to next tab
        }
      }
    });

    var prompt = $("#prompt");
    var promptActions = {
      9: function handleTab() {
        console.log("tabbed");
      },
      13: function sendMessage() {
        var text = prompt.val();
        if(prompt.val().length > 0 && socket.socket.connected === true) {
          socket.emit('message', {
            "channel": currentChannel,
            "text": text
          });
          prompt.val("");
        }
      }
    };

    prompt.keydown(function(e) {
      var action = promptActions[e.keyCode];
      if(typeof action === "function") {
        action();
        e.preventDefault();
      }
    });
  }

  function init() {

    win = $(window);
    doc = $(document);

    sidebar = $("#SideBar");
    sidebarLinks = $("#SideBar li:not(.console)");
    panel = $("#Panel");
    title = $("header .title");

    bindKeys();

    currentChannel = localStorage.getItem("currentChannel");

    sidebar.delegate("li", "click", selectChannel);

    initWSConnection();
  }

  $(init);

})(jQuery, window, io);
