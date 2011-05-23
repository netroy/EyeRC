$(function(){
  var $ = jQuery;
  var console = window.console || {};
  if(!console.log) console.log = function(){};
  var partial = "<p><u>{from}</u><span>{linkify(text)}</span><time data='{time}'>{pretty(time)}</time></p>";
  var socket = new io.Socket(location.hostname,{"port":location.port});

  var entities = {"<":"&lt;",">":"&gt;",'&':'&amp;','"':'&quot;',"'": '&#32;'};

  function linkify(text){
    text = text.replace(/[&"'><]/g,function(match){return entities[match]});
    text = text.replace(/((https?):\/\/([-\w\.]+)+(:\d+)?(\/([\w\/_\.\-#]*(\?\S+)?)?)?)/gm,'<a href="$1" target="_blank">$1</a>');
    text = text.replace(/^\@?([\w]*):/,function(match){return (match==='http')?match:match.bold();});
    return text;
  }

  function render(template,data){return template.replace(/{[\w\.\(\)]+}/g,function(match){
    var token=match.replace(/[\{\}]/g,"");try{with(data){return eval(token);}}catch(e){return"";}
  });}

  function hashroute(a,b,c){function e(d){d=location.hash;if(d!=c){for(b=0,c=d;(d=a[b++])&&!(d=d.exec(c));b++);a[b](d)}};e();setInterval(e,b||99)};
  
  function rescale(){
    var h = $(window).height();
    $("div.ui-tabs-panel").height(h-120);
    $("ol").height(h-130);
    $(".channel section").height(h-180);
    $("#server section").height(h-120);
  }

  function pretty(a){
    var a = ((new Date)-(new Date(a)))/1000;
    for(b=[60,60,24],c=0;a>b[c];a/=b[c++]);
    a = ~~a;
    return (c===0 && a < 10)?"now":(a+" "+"sec0min0hour0day".split(0)[c]+(a>1?"s":"")+" ago");
  }

  function prettyTime(){
    $("time").each(function(){
      $(this).html(pretty($(this).attr("data")));
    });
    setTimeout(prettyTime,30*1000);
  }

  var tabMap = {}, selectedTab = 0;
  var tabList = $("#tabs").tabs({'add':function(e,ui){
    if(ui.index === 0) return;
    var tab = $(ui.tab).addClass('channel');
    var panel = $(ui.panel).addClass('channel');
    var sup = tab.append("<sup>0<\/sup>").find("sup");
    tabMap[tab.find("span").html()] = {
      "index": ui.index,
      "tab": tab,
      "panel": panel,
      "note": sup
    };
  }, select:function(e,ui){
    selectedTab = $(ui.tab).find("span").html();
    var section = $("section",ui.panel)[0];
    setTimeout(function(){
      section.scrollTop = section.scrollHeight;
    },100);
    document.cookie = "selectedTab="+selectedTab;
  }});

  function tabId(name){
    return "#tab_" + name.replace(/[#\-\.]/g,"");
  }

  function addTab(name){
    var id = tabId(name);
    tabList.tabs("add", id, name);
    id = $(id).html("<h4></h4><section></section><ol></ol>");
    rescale();
    return id;
  }

  function draw(backlog){
    var channel, name, id, sidebar, log;
    var msg, nick;

    for(name in backlog){
      if(name === 'server') continue;
      channel = backlog[name];

      if(backlog.hasOwnProperty(name) && typeof channel === 'object' && typeof channel.topic === 'string'){
        id = $(addTab(name));
        id.find("h4").html(linkify(channel.topic));
        sidebar = id.find("ol");
        log = id.find("section").empty();
        for(msg in channel.messages){
          msg = channel.messages[msg];
          log.append(render(partial,msg));
        }
        for(nick in channel.names){
          sidebar.append("<li><u>"+nick+"</u></li>");
        }
        if(tabMap[name]){
          tabMap[name].note.html($("p",log).length);
        }
        log[0].scrollTop = log[0].scrollHeight;
      }
    }

    if(backlog['server'] instanceof Array && backlog['server'].length > 0){
      var server = $("#server section");
      for(msg in backlog['server']){
        msg = backlog['server'][msg];
        server.append("<p>"+msg+"<\/p>");
        server[0].scrollTop = server[0].scrollHeight;
      }
    }

    if(!!(tabCookie = document.cookie.match(/selectedTab=(#{1,2}[\w\.\-]+)/))){
      selectedTab = tabMap[tabCookie[1]];
      if(!!selectedTab && !!selectedTab.index){
        tabList.tabs('select',selectedTab.index);
      }
    }
    rescale();
    $(window).resize(rescale);
    prettyTime();
  }

/*
  hashroute([
    /^$/, function(){tabList.tabs('select',0);}
    , function(){tabList.tabs('select',0);}
  ]);
*/

  socket.connect();
  socket.on('connect', function(){
    console.log("socket connected");
  });
  socket.on('message', function(m,id){
    if(m.backlog){
      draw(m.backlog);
    }else if(m.message){
      m = m.message;
      id = $(tabId(m.channel));
      id = $("section", id).append(render(partial,m));
      if(tabMap[m.channel]){
        tabMap[m.channel].note.html($("p",id).length);
      }
    }else if(m.join || m.part){
      id = $(tabId(m.channel));
      m = (m.join)?m.join+" joined":m.part+" left";
      $("section", id).append("<i>"+(m)+" the room</i>");
    }else if(m.topic){
      id = $(tabId(m.channel));
      if(id.length === 0){
        id = addTab(m.channel);
      }
      id.find("h4").html(m.topic);
    }else if(m.names){
      id = $(tabId(m.channel));
      if(id.length === 0){
        id = addTab(m.channel);
      }
      sidebar = id.find("ol").empty();
      for(nick in m.names){
        sidebar.append("<li><u>"+nick+"</u></li>");
      }
    }else if(m.motd){
      $("#server section").prepend("<p>"+m.motd.replace(/[\r\n]+/,"<br/>")+"</p>");
    }
  }); 
  socket.on('disconnect', function(){
    console.log("socket disconnected, trying to reconnect in 10 seconds");
    setTimeout(socket.connect,10*1000);
  });

  $("p, ol li", $("#tabs")).live("click",function(e){
    console.log($(this).find("u").html());
  });

  var postbox = $("#postbox");
  $(document).keydown(function(e) {
    if(e.ctrlKey && !!String.fromCharCode(e.keyCode).match(/[0-9]/)){
      var index = e.keyCode - '0'.charCodeAt(0);
      var tabs = $("#tabs li");
      if(index >= tabs.length) return;
      tabList.tabs('select', index);
    }else if(e.which === 13 && e.target.nodeName.toLowerCase() === 'input'){
      var text = postbox.val();
      if(text.length > 0 && text.connected === true){
        socket.send({"channel":selectedTab,"text":text});
        postbox.val("");
        id = $("section", $(tabId(selectedTab))).append(render(partial,{
          from: EYERC.nick, 
          channel: selectedTab, 
          text: text, 
          time: (new Date).toUTCString()
        }));
      }
    }
  });

});