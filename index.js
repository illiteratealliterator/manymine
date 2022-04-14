'use strict';

const dgram = require('dgram');
const { createSerializer, createDeserializer } = require('raknet/src/transforms/serializer');
const Observer = require('./source/observer');
const Connector = require('./source/connector');

// Configuration
const MM_LISTEN_PORT = parseInt(process.env.MM_LISTEN_PORT || '19132');
const MM_DISCOVERY_INTERVAL = parseInt(process.env.MM_DISCOVERY_INTERVAL || '0');
const MM_PING_INTERVAL = parseInt(process.env.MM_PING_INTERVAL || '1000');

// Mapping from container id to connector instance
const connectors = {};

// Observe active docker containers
const observer = new Observer(MM_DISCOVERY_INTERVAL);

// Transform data packets
const parser = createDeserializer(true);
const serializer = createSerializer(true);

// Handle a server being added
observer.on('serverAdded', server => {
  console.log(`Server added: ${server.name} (${server.id})`);

  if (server.ipAddress) {
    let internalPort = MM_LISTEN_PORT;
    
    // Has the server been configured to run on a non-default port
    if (server.internalPort != null) {
      console.log(`Server ${server.name} configured to use internal port ${server.internalPort}`);
      internalPort = server.internalPort;
    }

    // Find the mapping for the internal server port
    let portMapping = server.portMappings.find(portMapping => portMapping.privatePort === internalPort);

    // Default to using the only port mapping there is
    if (!portMapping && server.portMappings.length === 1) {
      portMapping = server.portMappings[0];
    }

    if (portMapping) {
      console.log(`Server ${server.name} is running on internal port ${portMapping.privatePort} and external port ${portMapping.publicPort}`);
      const connector = new Connector(server.name, server.ipAddress, portMapping.privatePort, portMapping.publicPort, MM_PING_INTERVAL, parser, serializer);
      connectors[server.id] = connector;
      connector.on('changed', (oldState, newState) => {
        console.log(`${connector.name} changed state from [${oldState}] to [${newState}]`)
      });
      connector.on('error', error => {
        console.error(`${connector.name} ${error.message}`);
      });
    } else {
      console.error(`Server ${server.name} has no mapping for internal port ${internalPort}`);
    }
  } else {
    console.error(`Server ${server.name} has no ip address`);
  }
});

// Handle a server being removed
observer.on('serverRemoved', server => {
  console.log(`Server removed: ${server.name} (${server.id})`);
  const connector = connectors[server.id];
  if (connector) {
    connector.close();
    delete connectors[server.id];
  }
});

// Parse an incoming unconnected ping packet
function parseUnconnectedPing(data) {
  try {
    const parsed = parser.parsePacketBuffer(data);
    if (parsed.data.name !== 'unconnected_ping') {
      console.error('Ignoring unexpected packet on listen port:', parsed.data.name);
      return null;
    }
    return parsed;
  }
  catch (error) {
    console.error(`Listener: Ignoring unexpected/invalid packet on listen port. Do you have a client that has a manually configured server pointing to port 19132?`);
    return null;
  }
}

// Respond to a ping from a minecraft client
function handleClientPing(socket, address, port, data) {
  const parsed = parseUnconnectedPing(data);
  if (parsed) {
    console.log(`Ping from client ${address}:${port}`);
    for (const connector of Object.values(connectors)) {
      if (connector.remoteServerID !== null) {
        const updatedServerName = connector.remoteServerName.replace(connector.privatePort, connector.publicPort);
        const serialized = serializer.createPacketBuffer({
          name: 'unconnected_pong', 
          params: {
            pingID: parsed.data.params.pingID,
            serverID: connector.remoteServerID,
            magic: connector.remoteServerMagic,
            serverName: updatedServerName
          }
        });
        socket.send(serialized, 0, serialized.length, port, address);
      }
    }
  }
}

// Check configuration
if (!MM_LISTEN_PORT) {
  console.error("No listen port specified (MM_LISTEN_PORT)");
  process.exit(1);
}

if (MM_PING_INTERVAL < 100) {
  MM_PING_INTERVAL = 100;
}

// Listen for broadcast pings from minecraft clients
const socket = dgram.createSocket({ type: 'udp4' });

socket.on('listening', () => {
  const address = socket.address();
  console.log(`Server discovery interval:`, MM_DISCOVERY_INTERVAL > 0 ? `${MM_DISCOVERY_INTERVAL}ms` : `None`);
  console.log(`Server ping interval: ${MM_PING_INTERVAL}ms`);
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
  console.info('Graceful shutdown on SIGTERM');
  for (const connector of Object.values(connectors)) {
    connector.close();
  }
  observer.close();
  process.exit();
});