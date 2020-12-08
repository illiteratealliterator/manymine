'use strict';

const EventEmitter = require('events');
const Docker = require('dockerode');

class Observer extends EventEmitter {
  constructor(options) {
    super();
    const self = this;
    self.docker = new Docker({socketPath: '/var/run/docker.sock'});
    self.options = options || {};
    self.serverPorts = self.options.serverPorts || [19132];
    self.updateTimeout = null;
    self.servers = {};
  }

  start() {
    const self = this;
    self.update();
  }

  async update() {
    const self = this;
    const containerList = await self.docker.listContainers();
    const containerData = await Promise.all(containerList.map(async info => {
      const container = await self.docker.getContainer(info.Id);
      return container.inspect();
    }));

    const activeServers = containerData
      .filter(info => info.State.Status === 'running' && info.Config.Labels['manymine.enable'] === "true")
      .map(info => new Observer.Server(info, self.serverPorts));

    for (const [id, server] of Object.entries(self.servers)) {
      if (!activeServers.find(s => s.id === id)) {
        self.removeServer(server);
      }
    }

    activeServers.forEach(s => self.addServer(s));
    self.emit('updated');

    clearTimeout(self.updateTimeout);
    self.updateTimeout = setTimeout(self.update.bind(self), 1000);
  }

  addServer(server) {
    const self = this;
    const existing = self.servers[server.id];
    if (existing) {
      if (!existing.equalTo(server)) {
        self.removeServer(existing);
        self.servers[server.id] = server;
        self.emit('serverAdded', server);
      }
    } else {
      self.servers[server.id] = server;
      self.emit('serverAdded', server);
    }
  }

  removeServer(server) {
    const self = this;
    delete self.servers[server.id];
    self.emit('serverRemoved', server);
  }

  close() {
    const self = this;
    clearTimeout(self.updateTimeout);
  }
}

Observer.Server = class {
  constructor (info, serverPorts) {
    const self = this;
    self.id = info.Id;
    self.name = info.Name || 'Unknown';
    self.ipAddress = null;
    self.portMappings = [];

    for (const serverPort of serverPorts) {
      const entries = info.NetworkSettings.Ports[serverPort + "/udp"];
      if (entries && entries.length > 0) {
        self.portMappings.push(new Observer.PortMapping(serverPort, parseInt(entries[0].HostPort)));
      }
    }

    for (const network of Object.values(info.NetworkSettings.Networks)) {
      if (network.IPAddress) {
        self.ipAddress = network.IPAddress;
        break;
      }
    }
  }

  equalTo(other) {
    const self = this;
    return self.id === other.id
      && self.name === other.name
      && self.ipAddress === other.ipAddress
      && self.portMappings.length === other.portMappings.length
      && self.portMappings.every((m, i) => m.equalTo(other.portMappings[i]));
  }
}

Observer.PortMapping = class {
  constructor (privatePort, publicPort) {
    const self = this;
    self.privatePort = privatePort;
    self.publicPort = publicPort;
  }

  equalTo(other) {
    const self = this;
    return self.privatePort === other.privatePort 
      && self.publicPort === other.publicPort;
  }
}

module.exports = Observer;