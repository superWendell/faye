Faye.Transport = Faye.extend(Faye.Class({
  MAX_DELAY: <%= Faye::Engine::MAX_DELAY %>,
  batching:  true,

  initialize: function(client, endpoint) {
    this.debug('Created new ? transport for ?', this.connectionType, endpoint);
    this._client   = client;
    this._endpoint = endpoint;
    this._outbox   = [];
  },
  
  close: function() {},
  
  send: function(message, timeout) {
    this.debug('Client ? sending message to ?: ?',
               this._client._clientId, this._endpoint, message);

    if (!this.batching) return this.request([message], timeout);

    this._outbox.push(message);
    this._timeout = timeout;

    if (message.channel === Faye.Channel.HANDSHAKE)
      return this.flush();

    if (message.channel === Faye.Channel.CONNECT)
      this._connectMessage = message;

    this.addTimeout('publish', this.MAX_DELAY, this.flush, this);
  },

  flush: function() {
    this.removeTimeout('publish');

    if (this._outbox.length > 1 && this._connectMessage)
      this._connectMessage.advice = {timeout: 0};

    this.request(this._outbox, this._timeout);
    
    this._connectMessage = null;
    this._outbox = [];
  },
  
  receive: function(responses) {
    this.debug('Client ? received from ?: ?',
               this._client._clientId, this._endpoint, responses);
    
    Faye.each(responses, this._client.receiveMessage, this._client);
  },
  
  retry: function(message, timeout) {
    var self = this, called = false;
    return function() {
      if (called) return;
      called = true;
      Faye.ENV.setTimeout(function() { self.request(message, 2 * timeout) }, 1000 * timeout);
    };
  }
  
}), {
  get: function(client, connectionTypes, callback, scope) {
    var endpoint = client.endpoint;
    if (connectionTypes === undefined) connectionTypes = this.supportedConnectionTypes();
    
    Faye.asyncEach(this._transports, function(pair, resume) {
      var connType = pair[0], klass = pair[1];
      if (Faye.indexOf(connectionTypes, connType) < 0) return resume();
      
      klass.isUsable(endpoint, function(isUsable) {
        if (isUsable) callback.call(scope, new klass(client, endpoint));
        else resume();
      });
    }, function() {
      throw new Error('Could not find a usable connection type for ' + endpoint);
    });
  },
  
  register: function(type, klass) {
    this._transports.push([type, klass]);
    klass.prototype.connectionType = type;
  },
  
  _transports: [],
  
  supportedConnectionTypes: function() {
    return Faye.map(this._transports, function(pair) { return pair[0] });
  }
});

Faye.extend(Faye.Transport.prototype, Faye.Logging);
Faye.extend(Faye.Transport.prototype, Faye.Timeouts);

