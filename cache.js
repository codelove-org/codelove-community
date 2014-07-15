var https     = require('https');
var redis     = require('redis'),
     rpub     = redis.createClient(),
     rsub     = redis.createClient(),
     docstore = redis.createClient();

console.log('Loading configuration...');
var config = require('./codelove-community.json');

rsub.subscribe('codelove-community');
rsub.on('message', function(channel, message) {
  if (channel == 'codelove-community') {
    switch(message) {
      case 'cacheGists':
        cacheGists();
        break;
      case 'cacheUsers':
        cacheUsers();
        break;
    }
  }
});

function scheduleCacheUsers() {
  console.log('scheduling cacheUsers');
  rpub.publish('codelove-community', 'cacheUsers');
};

function scheduleCacheGists() {
  console.log('scheduling cacheGists');
  rpub.publish('codelove-community', 'cacheGists');
};

setInterval(scheduleCacheUsers, 5000);
setInterval(scheduleCacheGists, 5000);

function cacheUsers() {
  console.log('executing cacheUsers');
  var options = {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'codelove'
    },
    hostname: 'api.github.com',
    method: 'GET', 
    path: '/orgs/codelove-org/public_members?client_id=' + config.client_id + '&client_secret=' + config.client_secret,
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
      docstore.set('codelove-community.members', datastring, redis.print);
    });
  });

  members_req.end();
};

function cacheGists() {
  gists = [ ];

  docstore.get('codelove-community.members', function(err, data) {
    members = JSON.parse(data);
    function nextMember(i) {
      var member = members[i];

      if (!member) {
        gists = gists.sort(function(a,b) {
          return new Date(a.updated_at) - new Date(b.updated_at);
        }).reverse();
        docstore.set('codelove-community.gists', JSON.stringify(gists), redis.print); 
        return;
      }

      var options = {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'codelove-community'
        },
        hostname: 'api.github.com',
        method: 'GET', 
        path: '/users/' + member.login + '/gists?client_id=' + config.client_id + '&client_secret=' + config.client_secret,
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
          nextMember(i + 1);
        });
      });
  
      gists_req.end();
    };
      
    nextMember(0);
  });
};



