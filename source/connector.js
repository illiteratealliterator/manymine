'use strict';

const EventEmitter = require('events');
const dgram = require('dgram');
const { createSerializer, createDeserializer } = require('raknet/src/transforms/serializer');

function randomSigned32() {
  return Math.floor((Math.random() - 0.5) * Math.pow(2, 32));
}

class Connector extends EventEmitter {
  constructor (name, host, privatePort, publicPort) {
    super();
    const self = this;
    self.host = host;
    self.privatePort = privatePort;
    self.publicPort = publicPort;
    self.name = `${name} (${self.host}:${self.publicPort})`;
    self.clientID = [randomSigned32(), randomSigned32()];
    self.socket = dgram.createSocket({ type: 'udp4' });
    self.serializer = createSerializer(true);
    self.parser = createDeserializer(true);
    self.remoteServerID = null;
    self.remoteServerMagic = null;
    self.remoteServerName = null;
    self.receivedPong = false;
    self.retryTimeout = null;
    self.state = 'Initial';

    self.serializer.on('data', (chunk) => {
      self.socket.send(chunk, 0, chunk.length, self.privatePort, self.host, (err) => {
        if (err) {
          self.setState('Error');
          self.emit('error', err);
        }
      });
    });

    self.parser.on('data', (parsed) => {
      if (parsed.data.name === 'unconnected_pong') {
        self.remoteServerID = parsed.data.params.serverID;
        self.remoteServerMagic = parsed.data.params.magic;
        self.remoteServerName = parsed.data.params.serverName;
        self.receivedPong = true;
      }
    });

    self.socket.on('message', (data, { port, address }) => {
      self.parser.write(data);
    });
    
    self.socket.bind();
    self.sendPing();
  }

  setState(newState) {
    const self = this;
    if (newState !== self.state) {
      const oldState = self.state;
      self.state = newState;
      self.emit('changed', oldState, self.state);
    }
  }

  sendPing() {
    const self = this;
    self.receivedPong = false;
    self.serializer.write({ 
      name: 'unconnected_ping', 
      params: {
        pingID: [0, 1],
        magic: [0, 255, 255, 0, 254, 254, 254, 254, 253, 253, 253, 253, 18, 52, 86, 120],
        unknown: self.clientID
      }
    });
    clearTimeout(self.retryTimeout);
    self.retryTimeout = setTimeout(() => {
      if (self.receivedPong) {
        self.setState('Connected');
      } else {
        self.setState('No Response');
        self.remoteServerID = null;
        self.remoteServerMagic = null;
        self.remoteServerName = null;
      }
      self.sendPing();
    }, 1000);
  }

  close() {
    const self = this;
    if (self.socket) {
      self.socket.close();
      clearTimeout(self.retryTimeout);
    }
  }
}

module.exports = Connector;