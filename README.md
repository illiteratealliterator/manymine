# manymine
A simple way to run multiple Minecraft Bedrock servers in docker containers on the same host, and be able to discover them as LAN games.

Run your Minecraft Bedrock servers on non-default ports (e.g. 60601, 60602...)

Add the label 'manymine.enable=true' to each server container you want manymine to announce to clients.

Both manymine and your minecraft servers need to be on the same docker network.

## Environment variables

- `MM_DISCOVERY_INTERVAL`
  - How often to look for new docker containers running a Bedrock Server (in milliseconds).
  - Defaults to `0` (discovery is only run once on startup)
  - If you'd like to periodically scan for new servers, set this to something like `5000`

- `MM_PING_INTERVAL`
  - How often to ping the known servers to update their game state.
  - Defaults to `1000`.
  - Not much reason to change this as the clients will be pinging at this rate.

## Docker Compose
Using docker compose, you'll want something like this:
```
version: "3.7"
services:
  manymine:
    image: illiteratealliterator/manymine
    container_name: manymine
    ports:
      - '19132:19132/udp'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  minecraft-a:
    image: itzg/minecraft-bedrock-server
    container_name: minecraft-a
    environment:
      - EULA=TRUE
      - SERVER_NAME=Server A
      - SERVER_PORT=60601
    volumes:
      - minecraft-a-data:/data
    ports:
      - '60601:60601/udp'
    labels:
      - manymine.enable=true

  minecraft-b:
    image: itzg/minecraft-bedrock-server
    container_name: minecraft-b
    environment:
      - EULA=TRUE
      - SERVER_NAME=Server B
      - SERVER_PORT=60602
    volumes:
      - minecraft-b-data:/data
    ports:
      - '60602:60602/udp'
    labels:
      - manymine.enable=true

volumes:
  minecraft-a-data:
  minecraft-b-data:
```
