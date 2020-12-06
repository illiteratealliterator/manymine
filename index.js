'use strict';

const dgram = require('dgram');
const { createSerializer, createDeserializer } = require('raknet/src/transforms/serializer');

// Configuration
const MM_LISTEN_PORT = process.env.MM_LISTEN_PORT || '19132';
const MM_HOST = process.env.MM_HOST || null;
const MM_SERVER_PORTS = process.env.MM_SERVER_PORTS ? JSON.parse(process.env.MM_SERVER_PORTS) : [];
const MM_PING_FREQUENCY = parseInt(process.env.MM_PING_FREQUENCY || '1000');

function randomSigned32() {
  return Math.floor((Math.random() - 0.5) * Math.pow(2, 32));
}

// Manages the connection to a single minecraft server
class Connector {
  constructor (host, port) {
    this.name = `${host}:${port}`;
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
    this.state = 'Unknown';

    this.serializer.on('data', (chunk) => {
      this.socket.send(chunk, 0, chunk.length, this.port, this.host, (err) => {
        if (err) {
          this.setState('Error');
          console.log(err.message);
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
    
    this.socket.bind();
    this.sendPing();
  }

  setState (newState) {
    if (newState !== this.state) {
      console.log(`${this.name} changed state from [${this.state}] to [${newState}]`)
      this.state = newState;
    }
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
      if (this.receivedPong) {
        this.setState('Connected');
      } else {
        this.setState('No Response');
        this.remoteServerID = null;
        this.remoteServerMagic = null;
        this.remoteServerName = null;
      }
      this.sendPing();
    }, MM_PING_FREQUENCY);
  }
}

// Respond to a ping from a minecraft client
function handleClientPing (socket, host, port, data) {
  const parser = createDeserializer(true);
  const serializer = createSerializer(true);

  parser.on('data', (parsed) => {
    if (parsed.data.name === 'unconnected_ping') {
      for (const connector of connectors) {
        if (connector.remoteServerID !== null) {
          const updatedServerName = connector.remoteServerName.replace(MM_LISTEN_PORT, connector.port);
          serializer.write({
            name: 'unconnected_pong', 
            params: {
              pingID: parsed.data.params.pingID,
              serverID: connector.remoteServerID,
              magic: connector.remoteServerMagic,
              serverName: updatedServerName
            }
          });
        }
      }
    } else {
      console.log('Received unexpected packet on listen port:', parsed.data.name);
    }
  });

  serializer.on('data', (chunk) => {
    socket.send(chunk, 0, chunk.length, port, host);
  });

  parser.write(data);
}

// Check configuration
if (MM_LISTEN_PORT) {
  console.log(`MM_LISTEN_PORT=${MM_LISTEN_PORT}`);
} else {
  console.log("No listen port specified (MM_LISTEN_PORT)");
  process.exit(1);
}

if (MM_HOST) {
  console.log(`MM_HOST=${MM_HOST}`);
} else {
  console.log("No host address specified (MM_HOST)");
  process.exit(1);
}

if (MM_SERVER_PORTS && MM_SERVER_PORTS.length > 0) {
  console.log(`MM_SERVER_PORTS=${MM_SERVER_PORTS}`);
} else {
  console.log("No server ports specified (MM_SERVER_PORTS)");
  process.exit(1);
}

if (MM_PING_FREQUENCY > 0) {
  console.log(`MM_PING_FREQUENCY=${MM_PING_FREQUENCY}`);
} else {
  console.log("Invalid ping frequency (MM_PING_FREQUENCY)");
  process.exit(1);
}

// Connect to each configured server
const connectors = MM_SERVER_PORTS.map(port => new Connector(MM_HOST, port));

// Listen for broadcast pings from minecraft clients
const socket = dgram.createSocket({ type: 'udp4' });

socket.on('listening', () => {
  const address = socket.address();
  console.log(`Listening for pings at ${address.address}:${address.port}`);  
});

socket.on('message', (data, { port, address }) => {
  handleClientPing(socket, address, port, data);
});

socket.bind(MM_LISTEN_PORT);