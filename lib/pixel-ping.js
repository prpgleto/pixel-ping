// Generated by CoffeeScript 2.1.0
(function() {
  // Require Node.js core modules.
  var VERSION, config, configPath, emptyHeaders, endParams, endReqOpts, flush, fs, handleRequest, http, https, httpsPattern, log, merge, pixel, pixelHeaders, protocolOptions, querystring, record, reset, serialize, server, store, url;

  fs = require('fs');

  url = require('url');

  http = require('http');

  https = require('https');

  querystring = require('querystring');

  //### The Pixel Ping server

  // Keep the version number in sync with `package.json`.
  VERSION = '0.1.6';

  // Regular expression for HTTPS addresses
  httpsPattern = new RegExp('^https://', 'i');

  store = {};

  // Record hits from the remote pixel.
  record = function(key, count) {
    store[key] || (store[key] = 0);
    return store[key] += count;
  };

  // Serializes the current `store` to JSON, and creates a fresh one. Add a
  // `secret` token to the request object, if configured.
  serialize = function() {
    var data;
    data = {
      json: JSON.stringify(store)
    };
    if (config.secret) {
      data.secret = config.secret;
    }
    return querystring.stringify(data);
  };

  // Reset the `store`.
  reset = function() {
    var oldStore;
    oldStore = store;
    store = {};
    return oldStore;
  };

  // Merge the given `store` with the current one.
  merge = function(newStore) {
    var count, key;
    for (key in newStore) {
      count = newStore[key];
      record(key, count);
    }
    return null;
  };

  // Flushes the `store` to be saved by an external API. The contents of the store
  // are sent to the configured `endpoint` URL via HTTP/HTTPS POST. If no `endpoint` is
  // configured, this is a no-op.
  flush = function() {
    var data, endpointProtocol, oldStore, onError, request;
    log(store);
    if (!config.endpoint) {
      return;
    }
    endpointProtocol = httpsPattern.test(config.endpoint) ? https : http;
    data = serialize();
    oldStore = reset();
    onError = function(message) {
      if (!config.discard) {
        merge(oldStore);
      }
      return console.error(message);
    };
    endReqOpts['headers']['Content-Length'] = data.length;
    request = endpointProtocol.request(endReqOpts, function(res) {
      var ref;
      if ((200 <= (ref = res.statusCode) && ref < 300)) {
        return console.info('--- flushed ---');
      } else {
        return onError("--- flush failed with code:" + res.statusCode);
      }
    });
    request.on('error', function(e) {
      return onError(`--- cannot connect to endpoint : ${e.message}`);
    });
    request.write(data);
    return request.end();
  };

  // Log the contents of the `store` to **stdout**. Happens on every flush, so that
  // there's a record of hits if something goes awry.
  log = function(hash) {
    var hits, key;
    for (key in hash) {
      hits = hash[key];
      console.info(`${hits}:\t${key}`);
    }
    return null;
  };

  //### Configuration

  // Load the configuration and the contents of the tracking pixel. Handle requests
  // for the version number, and usage information.
  configPath = process.argv[2];

  if (configPath === '-v' || configPath === '-version' || configPath === '--version') {
    console.log(`Pixel Ping version ${VERSION}`);
    process.exit(0);
  }

  if (!configPath || (configPath === '-h' || configPath === '-help' || configPath === '--help')) {
    console.error("Usage: pixel-ping path/to/config.json");
    process.exit(0);
  }

  config = JSON.parse(fs.readFileSync(configPath).toString());

  pixel = fs.readFileSync(__dirname + '/pixel.gif');

  // HTTP/HTTPS headers for the pixel image.
  pixelHeaders = {
    'Cache-Control': 'private, no-cache, proxy-revalidate, max-age=0',
    'Content-Type': 'image/gif',
    'Content-Disposition': 'inline',
    'Content-Length': pixel.length
  };

  // HTTP/HTTPS headers for the 404 response.
  emptyHeaders = {
    'Content-Type': 'text/html',
    'Content-Length': '0'
  };

  // If an `endpoint` has been configured, create an HTTP/HTTPS client connected to it,
  // and log a warning otherwise.
  if (config.endpoint) {
    console.info(`Flushing hits to ${config.endpoint}`);
    endParams = url.parse(config.endpoint);
    endReqOpts = {
      host: endParams.hostname,
      method: 'POST',
      path: endParams.pathname,
      headers: {
        'host': endParams.host,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    if (endParams.port) {
      endReqOpts.port = endParams.port;
    }
  } else {
    console.warn(`No endpoint set. Hits won't be flushed, add "endpoint" to ${configPath}.`);
  }

  // Sending `SIGUSR2` to the Pixel Ping process will force a data flush.
  process.on('SIGUSR2', function() {
    console.log('Got SIGUSR2. Forcing a flush:');
    return flush();
  });

  // Don't let exceptions kill the server.
  process.on('uncaughtException', function(err) {
    return console.error(`Uncaught Exception: ${err}`);
  });

  // When a request comes in, ensure that it's looking
  // for `pixel.gif`. If it is, serve the pixel and record a hit.
  handleRequest = function(req, res) {
    var key, params, ref;
    params = url.parse(req.url, true);
    if (params.pathname === '/pixel.gif') {
      res.writeHead(200, pixelHeaders);
      res.end(pixel);
      if (key = (ref = params.query) != null ? ref.key : void 0) {
        record(key, 1);
      }
    } else {
      res.writeHead(404, emptyHeaders);
      res.end('');
    }
    return null;
  };

  // Determines the right protocol (HTTP/HTTPS) to be used on the nodejs server
  if (config.sslkey && config.sslcert && config.sslca) {
    protocolOptions = {
      key: fs.readFileSync(config.sslkey),
      cert: fs.readFileSync(config.sslcert),
      ca: fs.readFileSync(config.sslca)
    };
    server = https.createServer(protocolOptions, handleRequest);
  } else if (config.sslkey && config.sslcert) {
    protocolOptions = {
      key: fs.readFileSync(config.sslkey),
      cert: fs.readFileSync(config.sslcert)
    };
    server = https.createServer(protocolOptions, handleRequest);
  } else {
    server = http.createServer(handleRequest);
  }

  //### Startup

  // Start the server listening for pixel hits, and begin the periodic data flush.
  server.listen(config.port, config.host);

  setInterval(flush, config.interval * 1000);

}).call(this);
