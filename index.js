'use strict';

const dgram = require('dgram');
const { createSerializer, createDeserializer } = require('raknet/src/transforms/serializer');

// Configuration
const MM_LISTEN_HOST = process.env.MM_LISTEN_HOST || null;
const MM_LISTEN_PORT = process.env.MM_LISTEN_PORT || '19132';
const MM_SERVERS = (process.env.MM_SERVERS ? JSON.parse(process.env.MM_SERVERS) : []).map(server => {
  const values = server.split(':', 2);
  if (values.length !== 2) {
    console.log(`Invalid server configuration: ${server}`);
    process.exit(1);
  }
  return { 
    host: values[0],
    port: values[1]
  };
});

function randomSigned32() {
  return Math.floor((Math.random() - 0.5) * Math.pow(2, 32));
}

// Manages the connection to a single minecraft server
class Connector {
  constructor (index, host, port) {
    this.index = index;
    this.host = host;
    this.port = port;
    this.clientID = [randomSigned32(), randomSigned32()];
    this.socket = dgram.createSocket({ type: 'udp4' });
    this.serializer = createSerializer(true);
    this.parser = createDeserializer(true);
    this.remoteServerID = null;
    this.remoteServerMagic = null;
    this.remoteServerName = null;
    this.receivedPong = false;
    
    this.serializer.on('data', (chunk) => {
      this.socket.send(chunk, 0, chunk.length, this.port, this.host, (err) => {
        if (err) {
          console.log(`Unable to send ping to ${this.host}:${this.port}`);
        }
      });
    });

    this.parser.on('data', (parsed) => {
      if (parsed.data.name === 'unconnected_pong') {
        this.remoteServerID = parsed.data.params.serverID;
        this.remoteServerMagic = parsed.data.params.magic;
        this.remoteServerName = parsed.data.params.serverName;
        this.receivedPong = true;
      }
    });

    this.socket.on('message', (data, { port, address }) => {
      this.parser.write(data);
    });
    
    console.log(`${this.index} Connecting to Minecraft Server at ${host}:${port}`);
    this.socket.bind();
    this.sendPing();
  }

  sendPing () {
    this.receivedPong = false;
    this.serializer.write({ 
      name: 'unconnected_ping', 
      params: {
        pingID: [0, 1],
        magic: [0, 255, 255, 0, 254, 254, 254, 254, 253, 253, 253, 253, 18, 52, 86, 120],
        unknown: this.clientID
      }
    });
    setTimeout(() => {
      if (!this.receivedPong) {
        console.log(`${this.index} No response from server`);
        this.remoteServerID = null;
        this.remoteServerMagic = null;
        this.remoteServerName = null;
      }
      this.sendPing();
    }, 1000);
  }
}

// Respond to a ping from a minecraft client
function handleClientPing (socket, host, port, data) {
  const parser = createDeserializer(true);
  const serializer = createSerializer(true);

  parser.on('data', (parsed) => {
    for (const connector of connectors) {
      if (connector.remoteServerID !== null) {
        serializer.write({ 
          name: 'unconnected_pong', 
          params: {
            pingID: parsed.data.params.pingID,
            serverID: connector.remoteServerID,
            magic: connector.remoteServerMagic,
            serverName: connector.remoteServerName
          }
        });
      }
    }
  });

  serializer.on('data', (chunk) => {
    socket.send(chunk, 0, chunk.length, port, host);
  });

  parser.write(data);
}

// Listen for broadcast pings from minecraft clients
const connectors = MM_SERVERS.map((server, index) => new Connector(index, server.host, server.port));
const socket = dgram.createSocket({ type: 'udp4' });

socket.on('listening', () => {
  const address = socket.address();
  console.log(`Listening for pings at ${address.address}:${address.port}`);  
});

socket.on('message', (data, { port, address }) => {
  handleClientPing(socket, address, port, data);
});

socket.bind(MM_LISTEN_PORT, MM_LISTEN_HOST);