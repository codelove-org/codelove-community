var express = require('express');
var session = require('express-session')
var http = require('http');
var https = require('https');
var url = require('url');
var querystring = require('querystring');
var util = require('util');
var fs = require('fs')

var connect = require('connect');
var connect_redis = require('connect-redis')(session);
var redis    = require('redis'),
    docstore = redis.createClient();

console.log('Loading configuration...');
var config = require('./codelove-community.json');
var cache = require('./cache.js');

var app = express();

app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: config.session_secret,
  secureProxy: true,
  store: new connect_redis
}));

app.use('/community/media', express.static(__dirname + '/media'));
app.get('/', function(req, res) {
  res.redirect('/community/members');
});

setInterval(cache.scheduleCacheUsers, 60000);
setInterval(cache.scheduleCacheGists, 60000);

app.set('view engine', 'jade');

function getPublicMembers(callback) {
  docstore.get('codelove-community.members', function (err, res) {
    callback(JSON.parse(res));
  });
};

function getPublicMemberGists(callback) {
  docstore.get('codelove-community.gists', function (err, res) {
    callback(JSON.parse(res));
  });
};

app.get('/community/members', function(req, res) {
  getPublicMembers(function renderPublicMembers(members) {
    res.render('community/members', { members: members });
  });
});

app.get('/community/posts', function(req, res) {
  getPublicMemberGists(function renderPublicGists(gists) {
    res.render('community/posts', { gists: gists });
  });
});

app.get('/auth/github/callback', function(req, res) {
  code = url.parse(req.url, true).query.code;
  var datastring = '';
  var post_data = querystring.stringify({
    'client_id': config.client_id,
    'client_secret': config.client_secret,
    'code': code
  });
  var options = {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': post_data.length
    },
    hostname: 'github.com',
    method: 'POST', 
    path: '/login/oauth/access_token',
    port: '443',
    rejectUnauthorized: 'false',
    requestCert: 'true'
  }
  var post_req = https.request(options, function (response) {
    response.on('data', function(chunk) {
      datastring += chunk;
    });

    response.on('end', function() {
      req.session.access_token = JSON.parse(datastring).access_token;
      res.redirect('/codeshare');
    });
  });

  post_req.write(post_data);
  post_req.end();

});

app.get('/auth/github/authorize', function(req, res) {
  res.writeHead(302, {'Location' :
    "http://github.com/login/oauth/authorize?client_id=" + config.client_id});
  res.end();
});

var server = app.listen(9000, function() {
  console.log('Listening on %s:%d', server.address().address, server.address().port);
});
