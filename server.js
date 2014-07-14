var express = require('express');
var session = require('express-session')
var http = require('http');
var https = require('https');
var url = require('url');
var querystring = require('querystring');
var util = require('util');
var fs = require('fs')

var connect = require('connect');
var redis = require('connect-redis')(session);

console.log('Loading configuration...');
var config = require('./codelove-community.json');

var app = express();

app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: config.session_secret,
  secureProxy: true,
  store: new redis
}));

app.use('/media', express.static(__dirname + '/media'));

app.set('view engine', 'jade');

function getPublicMembers(callback) {
   var options = {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'codelove'
    },
    hostname: 'api.github.com',
    method: 'GET', 
    path: '/orgs/codelove-org/public_members',
    port: '443',
    rejectUnauthorized: 'false',
    requestCert: 'true'
  }
  var members_req = https.request(options, function (response) {
    var datastring = '';
    response.on('data', function(chunk) {
      datastring += chunk;
    });

    response.on('end', function() {
      var members = JSON.parse(datastring);
      callback(members);
    });
  });

  members_req.end();
};

function getPublicGists(member, callback) {
  var options = {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'codelove-community'
    },
    hostname: 'api.github.com',
    method: 'GET', 
    path: '/users/' + member + '/gists',
    port: '443',
    rejectUnauthorized: 'false',
    requestCert: 'true'
  }
  var gists_req = https.request(options, function (response) {
    var datastring = '';
    response.on('data', function(chunk) {
      datastring += chunk;
    });

    response.on('end', function getPublicGists_end() {
      var gists = JSON.parse(datastring);
      console.log(member);
      console.log(util.inspect(gists));
      callback(gists);
    });
  });

  gists_req.end();
};
 


function getPublicMemberGists(callback) {
  gists = [ ];

  getPublicMembers(function(members) {
    function nextMember(i) {
      var member = members[i];

      if (!member) { callback(gists); return; }

      var options = {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'codelove-community'
        },
        hostname: 'api.github.com',
        method: 'GET', 
        path: '/users/' + member.login + '/gists',
        port: '443',
        rejectUnauthorized: 'false',
        requestCert: 'true'
      }
      var gists_req = https.request(options, function (response) {
        var datastring = '';
        response.on('data', function(chunk) {
          datastring += chunk;
        });
  
        response.on('end', function getPublicGists_end() {
          gists = gists.concat(JSON.parse(datastring));
          console.log(gists);
          nextMember(i + 1);
        });
      });
  
      gists_req.end();
    };
      
    nextMember(0);
  });
};

app.get('/community/members', function(req, res) {
  getPublicMembers(function renderPublicMembers(members) {
    res.render('community/members', { members: members });
  });
});

app.get('/community/posts', function(req, res) {
  getPublicMemberGists(function renderPublicGists(gists) {
    console.log(gists);
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
