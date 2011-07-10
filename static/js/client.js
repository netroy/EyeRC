$(function(){
  var $ = jQuery;
  var console = window.console || {};
  if(!console.log) console.log = function(){};
  var partial = "<p><u>{from}</u><time data='{time}'>{pretty(time)}</time><span>{linkify(text)}</span></p>";

  var socket;
  var server = $("#server section");
  var postbox = $("#postbox");
  var entities = {"<":"&lt;",">":"&gt;",'&':'&amp;','"':'&quot;',"'": '&#32;'};

  function linkify(text){
    text = text.replace(/[&"'><]/g,function(match){return entities[match]});
    text = text.replace(/((https?):\/\/([-\w\.]+)+(:\d+)?(\/([\w\/_\.\-#\+]*(\?\S+)?)?)?)/gm,'<a href="$1" target="_blank">$1</a>');
    text = text.replace(/^\@?([\w]*):/,function(match){return (match==='http')?match:match.bold();});
    return text;
  }

  function render(template,data){return template.replace(/{[\w\.\(\)]+}/g,function(match){
    var token=match.replace(/[\{\}]/g,"");
    try{with(data){return eval(token);}}catch(e){return"";}});
  }
  
  function rescale(){
    var h = $(window).height();
    $("div.ui-tabs-panel").height(h-120);
    $("ol").height(h-115);
    $(".channel section").height(h-180);
    $("#server section").height(h-120);
  }
  (function(){
    rescale();
    $(window).resize(rescale);
  })();

  function pretty(a){
    var a = ((new Date)-(new Date(a)))/1000;
    for(b=[60,60,24],c=0;a>b[c];a/=b[c++]);
    a = ~~a;
    return (c===0 && a < 10)?"now":(a+" "+"sec0min0hour0day".split(0)[c]+(a>1?"s":"")+" ago");
  }
  (function(){
    function prettyTime(){
      $("time").each(function(){
        $(this).html(pretty($(this).attr("data")));
      });
      $("section i").remove();
    };
    setInterval(prettyTime,60*1000);
  })();

  var tabMap = {}, selectedTab = 0, backlogged = false;
  var tabList = $("#tabs").tabs({'add':function(e,ui){
    if(ui.index === 0) return;
    var tab = $(ui.tab).addClass('channel');
    var panel = $(ui.panel).addClass('channel');
    var note = tab.append("<sup>0<\/sup>").find("sup");
    tabMap[tab.find("span").html()] = {
      "index": ui.index,
      "tab": tab,
      "panel": panel,
      "note": note
    };
    if(tab.find("span").html() === selectedTab){
      $("#tabs").tabs('select',ui.index);
    }
  }, select:function(e,ui){
    var tab = $(ui.tab);
    tab.removeClass("highlight").find("sup").html("0");
    selectedTab = tab.find("span").html();
    document.cookie = "selectedTab="+selectedTab;
  }});

  function tabId(name){
    return "#tab_" + name.replace(/[#\-\.]/g,"");
  }

  function addTab(name){
    var id = tabId(name);
    tabList.tabs("add", id, name);
    id = $(id).html("<h4></h4><section></section><ol><li class='search'><input /></li></ol>");
    return id;
  }

/*
  function hashroute(a,b,c){function e(d){d=location.hash;if(d!=c){for(b=0,c=d;(d=a[b++])&&!(d=d.exec(c));b++);a[b](d)}};e();setInterval(e,b||99)};
  hashroute([
    /^$/, function(){tabList.tabs('select',0);}
    , function(){tabList.tabs('select',0);}
  ]);
*/

  var note;
  socket = io.connect();
  socket.on('connect', function(){
    console.log("socket connected");
  });

  socket.on('message', function(m,id){
    if(m.message){
      m = m.message;
      if(!(m instanceof Array)){
        m = [m];
      };
      for(var i=0,l=m.length,n;i<l;i++){
        n = m[i];
        id = $(tabId(n.channel));
        id = $("section", id).prepend(render(partial,n));
        if(tabMap[n.channel]){
          note = tabMap[n.channel].note;
          if(backlogged && n.channel !== selectedTab){
            note.html(parseInt(note.html())+1);
            tabMap[n.channel].tab.addClass("highlight");
          }
        }
      }
    }else if(m.backlog){
      if(!!(tabCookie = document.cookie.match(/selectedTab=(#{1,2}[\w\.\-]+)/))){
        selectedTab = tabMap[tabCookie[1]];
        if(!!selectedTab && !!selectedTab.index){
          tabList.tabs('select',selectedTab.index);
        }
      }
      backlogged = true;
    }else if(m.join || m.part){
      id = $(tabId(m.channel));
      m = (m.join)?m.join+" joined":m.part+" left";
      $("section", id).prepend("<i>"+(m)+" the room</i>");
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
      rescale();
    }else if(m.motd){
      if(m.motd instanceof Array){
        m.motd = m.motd.join("<br/>");
      }
      if(server.find("p.motd").length === 0){
        server.append("<h5>MOTD</h5><p class='motd'></p>");
      }
      $("p.motd",server).append(m.motd.replace(/[\r\n]+/,"<br/>")+"<br/>");
    }
  }); 
  socket.on('disconnect', function(){
    console.log("socket disconnected, trying to reconnect in 10 seconds");
    setTimeout(socket.connect,10*1000);
  });

  server.find("h5").live('click',function(e){
    server.find("p.motd").toggle();
  });

  $("p u, ol u", $("#tabs")).live("click",function(e){
    postbox.focus().val($(e.target).html() + ": ");
  });

  $(document).keydown(function(e) {
    if(e.ctrlKey){
      if(!!String.fromCharCode(e.keyCode).match(/[0-9]/)){
        var index = e.keyCode - '0'.charCodeAt(0);
        var tabs = $("#tabs li");
        if(index >= tabs.length) return;
        tabList.tabs('select', index);
      }else if(e.keyCode == 37){
        // Move to last tab
      }else if(e.keyCode == 39){
        // Move to next tab
      }
    }else if(e.which === 13 && e.target.nodeName.toLowerCase() === 'input'){
      var text = postbox.val();
      if(selectedTab !== 0 && text.length > 0 && socket.connected === true){
        socket.send({"channel":selectedTab,"text":text});
        postbox.val("");
      }
    }
  });

  // Tada ... Done
});
