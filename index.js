'use strict';

const dgram = require('dgram');
const { createSerializer, createDeserializer } = require('raknet/src/transforms/serializer');
const Observer = require('./source/observer');
const Connector = require('./source/connector');

// Configuration
const MM_LISTEN_PORT = parseInt(process.env.MM_LISTEN_PORT || '19132');

// Mapping from container id to connector instance
const connectors = {};

// Observe active docker containers
const observer = new Observer();

observer.on('serverAdded', server => {
  console.log(`Server added: ${server.name} (${server.id})`);
  if (server.ipAddress) {
    const portMapping = server.portMappings.find(portMapping => portMapping.privatePort === MM_LISTEN_PORT);
    if (portMapping) {
      const connector = new Connector(server.name, server.ipAddress, portMapping.privatePort, portMapping.publicPort);
      connectors[server.id] = connector;
      connector.on('changed', (oldState, newState) => {
        console.log(`${connector.name} changed state from [${oldState}] to [${newState}]`)
      });
      connector.on('error', error => {
        console.log(`${connector.name} ${error.message}`);
      });
    } else {
      console.log(`Server ${server.name} (${server.id}) has no mapping for port ${MM_LISTEN_PORT}.`);
    }
  } else {
    console.log(`Server ${server.name} (${server.id}) has no ip address.`);
  }
});

observer.on('serverRemoved', server => {
  console.log(`Server removed: ${server.name} (${server.id})`);
  const connector = connectors[server.id];
  if (connector) {
    connector.close();
    delete connectors[server.id];
  }
});

// Respond to a ping from a minecraft client
function handleClientPing (socket, host, port, data) {
  const parser = createDeserializer(true);
  const serializer = createSerializer(true);

  parser.on('data', (parsed) => {
    if (parsed.data.name === 'unconnected_ping') {
      for (const connector of Object.values(connectors)) {
        if (connector.remoteServerID !== null) {
          const updatedServerName = connector.remoteServerName.replace(connector.privatePort, connector.publicPort);
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

// Listen for broadcast pings from minecraft clients
const socket = dgram.createSocket({ type: 'udp4' });

socket.on('listening', () => {
  const address = socket.address();
  console.log(`Listening for pings at ${address.address}:${address.port}`);  
});

socket.on('message', (data, { port, address }) => {
  handleClientPing(socket, address, port, data);
});

// Let's go
observer.start();
socket.bind(MM_LISTEN_PORT);

// Listen for termination message
process.on('SIGTERM', function onSigterm () {
  console.info('Graceful shutdown on SIGTERM.');
  for (const connector of Object.values(connectors)) {
    connector.close();
  }
  observer.close();
  process.exit();
});
