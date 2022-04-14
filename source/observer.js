'use strict';

const EventEmitter = require('events');
const Docker = require('dockerode');

class Observer extends EventEmitter {
  constructor(discoveryInterval) {
    super();
    this.discoveryInterval = discoveryInterval;
    this.docker = new Docker({socketPath: '/var/run/docker.sock'});
    this.updateTimeout = null;
    this.servers = {};
  }

  start() {
    this.update();
  }

  async update() {
    const containerList = await this.docker.listContainers();
    const containerData = await Promise.all(containerList.map(async info => {
      const container = await this.docker.getContainer(info.Id);
      return container.inspect();
    }));

    const activeServers = containerData
      .filter(info => info.State.Status === 'running' && info.Config.Labels['manymine.enable'] === "true")
      .map(info => new Observer.Server(info));

    for (const [id, server] of Object.entries(this.servers)) {
      if (!activeServers.find(s => s.id === id)) {
        this.removeServer(server);
      }
    }

    activeServers.forEach(s => this.addServer(s));
    this.emit('updated');

    clearTimeout(this.updateTimeout);
    if (this.discoveryInterval > 0) {
      this.updateTimeout = setTimeout(this.update.bind(this), this.discoveryInterval);
    }
  }

  addServer(server) {
    const existing = this.servers[server.id];
    if (existing) {
      if (!existing.equalTo(server)) {
        this.removeServer(existing);
        this.servers[server.id] = server;
        this.emit('serverAdded', server);
      }
    } else {
      this.servers[server.id] = server;
      this.emit('serverAdded', server);
    }
  }

  removeServer(server) {
    delete this.servers[server.id];
    this.emit('serverRemoved', server);
  }

  close() {
    clearTimeout(this.updateTimeout);
  }
}

Observer.Server = class {
  constructor (info) {
    this.id = info.Id;
    this.name = info.Name || 'Unknown';
    this.ipAddress = null;
    this.internalPort = null;
    this.portMappings = [];

    const configuredInternalPort = info.Config.Labels['manymine.internal-port'];
    if (configuredInternalPort) {
      this.internalPort = parseInt(configuredInternalPort);
    }

    for (const [key, entries] of Object.entries(info.NetworkSettings.Ports)) {
      if (key && entries) {
        const matches = key.match(/^(\d+)\/udp$/)
        if (matches) {
          const internalPort = parseInt(matches[1]);
          if (entries.length > 0 && entries[0].HostPort) {
            this.portMappings.push(new Observer.PortMapping(internalPort, parseInt(entries[0].HostPort)));
          }
        }
      }
    }

    for (const network of Object.values(info.NetworkSettings.Networks)) {
      if (network.IPAddress) {
        this.ipAddress = network.IPAddress;
        break;
      }
    }
  }

  equalTo(other) {
    return this.id === other.id
      && this.name === other.name
      && this.ipAddress === other.ipAddress
      && this.internalPort === other.internalPort
      && this.portMappings.length === other.portMappings.length
      && this.portMappings.every((m, i) => m.equalTo(other.portMappings[i]));
  }
}

Observer.PortMapping = class {
  constructor (privatePort, publicPort) {
    this.privatePort = privatePort;
    this.publicPort = publicPort;
  }

  equalTo(other) {
    return this.privatePort === other.privatePort 
      && this.publicPort === other.publicPort;
  }
}

module.exports = Observer;