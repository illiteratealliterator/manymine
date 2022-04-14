'use strict';

const EventEmitter = require('events');
const dgram = require('dgram');

function randomSigned32() {
  return Math.floor((Math.random() - 0.5) * Math.pow(2, 32));
}

class Connector extends EventEmitter {
  constructor (name, host, privatePort, publicPort, pingInterval, parser, serializer) {
    super();
    this.host = host;
    this.privatePort = privatePort;
    this.publicPort = publicPort;
    this.pingInterval = pingInterval;
    this.parser = parser;
    this.serializer = serializer;
    this.name = `${name} (${this.host}:${this.publicPort})`;
    this.clientID = [randomSigned32(), randomSigned32()];
    this.socket = dgram.createSocket({ type: 'udp4' });
    this.remoteServerID = null;
    this.remoteServerMagic = null;
    this.remoteServerName = null;
    this.receivedPong = false;
    this.retryTimeout = null;
    this.state = 'Initial';

    this.socket.on('message', (data, { port, address }) => {
      const parsed = this.parseUnconnectedPong(data);
      if (parsed) {
        console.log(`Pong from server ${address}:${port}`);
        this.remoteServerID = parsed.data.params.serverID;
        this.remoteServerMagic = parsed.data.params.magic;
        this.remoteServerName = parsed.data.params.serverName;
        this.receivedPong = true;
      }
    });
    
    this.socket.bind();
    this.sendPing();
  }

  parseUnconnectedPong(data) {
    try {
      const parsed = this.parser.parsePacketBuffer(data);
      if (parsed.data.name !== 'unconnected_pong') {
        console.error('Connector: Ignoring unexpected packet on listen port:', parsed.data.name);
        return null;
      }
      return parsed;
    }
    catch (error) {
      console.error(`Connector: Ignoring unexpected/invalid packet on listen port.`);
      console.log(error);
    }
  }

  setState(newState) {
    if (newState !== this.state) {
      const oldState = this.state;
      this.state = newState;
      this.emit('changed', oldState, this.state);
    }
  }

  sendPing() {
    this.receivedPong = false;

    const serialized = this.serializer.createPacketBuffer({ 
      name: 'unconnected_ping', 
      params: {
        pingID: [0, 1],
        magic: [0, 255, 255, 0, 254, 254, 254, 254, 253, 253, 253, 253, 18, 52, 86, 120],
        unknown: this.clientID
      }
    });

    this.socket.send(serialized, 0, serialized.length, this.privatePort, this.host, (err) => {
      if (err) {
        this.setState('Error');
        this.emit('error', err);
      }
    });

    clearTimeout(this.retryTimeout);
    this.retryTimeout = setTimeout(() => {
      if (this.receivedPong) {
        this.setState('Connected');
      } else {
        this.setState('No Response');
        this.remoteServerID = null;
        this.remoteServerMagic = null;
        this.remoteServerName = null;
      }
      this.sendPing();
    }, this.pingInterval);
  }

  close() {
    if (this.socket) {
      this.socket.close();
      clearTimeout(this.retryTimeout);
    }
  }
}

module.exports = Connector;