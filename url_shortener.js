var crypto = require('crypto');

var Express = require('express');
var Webtask = require('webtask-tools');
var redis = require('redis');

const HMAC_ALGORITHM = 'sha256';
const API_STATUS_CODES = {
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
    NOT_FOUND: 'NOT_FOUND'
}
const CURRENT_API_PREFIX = '/api/v1';
const TOKEN_LENGTH = 10;
const REDIS_NAMESPACE_URL = 'url:';
const REDIS_NAMESPACE_STATS = 'stats:';


// https://stackoverflow.com/a/41783627/920374
var getToken = function() {
   var randomBytes = crypto.randomBytes(Math.ceil(TOKEN_LENGTH / 2));
   return randomBytes.toString('hex').slice(0, TOKEN_LENGTH);
}


var HMACSignedURLHandler = function(key) {
    this._key = key;
}
HMACSignedURLHandler.prototype.signPayload = function(value) {
    return crypto.createHmac(HMAC_ALGORITHM, this._key).update(value).digest('hex');
}
HMACSignedURLHandler.prototype.verifySignature = function(payload) {
   return this.signPayload(this._key, payload['value']) === payload['signature'];
}
HMACSignedURLHandler.prototype.serialize = function(url) {
    return JSON.stringify({
        signature: this.signPayload(this._key, url),
        value: url
    });
}
HMACSignedURLHandler.prototype.deserialize = function(data) {
    var urlData = JSON.parse(data);
    if ( !this.verifySignature(urlData) ) {
        throw new Error('Invalid Signature');
    }
    return urlData['value'];
}

var server = new Express();
server.use(require('body-parser').json());
server.set('json spaces', 2);

server.use(function(request, response, next) {
    var isNotJSON = request.headers['content-type'] !== 'application/json';
    var isAPI = request.path.startsWith(CURRENT_API_PREFIX);
    var isPOST = request.method === 'POST';
    if (isPOST && isAPI && isNotJSON) {
        return response.sendStatus(406);
    }
    next();
});

 
// Create 
server.post(`${CURRENT_API_PREFIX}/urls`, function (request, response) {
    var signingKey = request.webtaskContext.data.HMAC_KEY;
    var redisClient = redis.createClient(request.webtaskContext.data.REDIS_URL);
    var hmacHandler = new HMACSignedURLHandler(signingKey);
    var url = request.body.url;
    var serializedSignedURL = hmacHandler.serialize(url);
    var token = getToken(url);
    var redisKey = REDIS_NAMESPACE_URL + token;
    var status = null;
    redisClient.set(redisKey, serializedSignedURL, function(error, result) {
        if (error) {
            token = null;
            status = API_STATUS_CODES.ERROR;
        } else {
            status = API_STATUS_CODES.SUCCESS;
        }
        return response.json({
            url,
            token,
            status
        });
    });
});


server.get(`${CURRENT_API_PREFIX}/urls`, function (request, response) {
    var redisClient = redis.createClient(request.webtaskContext.data.REDIS_URL);
    redisClient.keys(`${REDIS_NAMESPACE_URL}*`, function(error, result) {
        if (error) {
            token = null;
            status = API_STATUS_CODES.ERROR;
        } else {
            status = API_STATUS_CODES.SUCCESS;
        }
        return response.json({
            url: result.map(function(key){ return key.split(':')[1]; }),
            status
        });
    });
});


server.get('/:token', function(request, response) {
    var signingKey = request.webtaskContext.data.HMAC_KEY;
    var redisClient = redis.createClient(request.webtaskContext.data.REDIS_URL);
    var hmacHandler = new HMACSignedURLHandler(signingKey);
    var redisKey = REDIS_NAMESPACE_URL + request.params.token;
    var userAgent = request.headers['user-agent'].toLowerCase();
    redisClient.get(redisKey, function(error, result) {        
        if (error || result === null ) {
            return response.sendStatus(404);
        }
        var statsRedisKey = REDIS_NAMESPACE_STATS + request.params.token;
	redisClient.hincrby(statsRedisKey, userAgent, 1);
        var url = hmacHandler.deserialize(result);
        return response.redirect(url);
    });
});


server.get('/', function(request, response) {
    var route, routes = [];

    server._router.stack.forEach(function(middleware){
        if(middleware.route) { // routes registered directly on the app
            routes.push(middleware.route);
        } else if(middleware.name === 'router'){ // router middleware 
            middleware.handle.stack.forEach(function(handler){
                route = handler.route;
                route && routes.push(route);
            });
        }
    });

    return response.json(routes);
});

module.exports = Webtask.fromExpress(server);
