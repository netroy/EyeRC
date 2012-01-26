var config = exports;

config.sessions = {
  secret: "YW55IGNhcm5hbCBwbGVhc3",
  key: "uid",
  expires: 86400000
};

config.admins = ["QiBala"];

config.twitter = {
  consumerKey: "QwG0YGi02cJBl59Uv7w3jg",
  consumerSecret: "vN0Ry5ZGccyazCbLJ5dhb8vicH6oe4x5KoEN99O7DY"
};

config.github = {
  appId: "51410c23ad3f6aaa5e52",
  appSecret: "2922ab6f9125d3a7ef8843913102d04aa550a033",
  scope: "user"
};

config.http = {
  port: 11080
};

config.irc = {
  server: "irc.freenode.net",
  channels: ["#hasgeek", "#Node.js", "#nodester", "##javascript", "#jquery", "#html5", "#css", "#redis", "#git", "#EyeRC"],
  nick: "QiBala",
  name: "QiBala",
  pass: null,
  awayMsg: "gone away",
  MAX_LOG: 200
};

exports.config = config;
