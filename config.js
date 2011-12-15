var config = {
  http: {
    port: 11080
  },
  irc: {
    server: "irc.freenode.net",
    channels: ["#Node.js", "##javascript", "#jquery", "#html5", "#css", "#nginx", "#redis", "#git"],
    nick: "QiBol",
    name: "QiBol",
    pass: null,
    awayMsg: "gone away"
  },
  twitter: {
    key: "QwG0YGi02cJBl59Uv7w3jg",
    secret: "vN0Ry5ZGccyazCbLJ5dhb8vicH6oe4x5KoEN99O7DY"
  },
  MAX_LOG: 300
};
exports.config = config;
