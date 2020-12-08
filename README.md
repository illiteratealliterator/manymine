# manymine
A simple way to run multiple Minecraft Bedrock servers in docker containers on the same host, and be able to discover them as LAN games.

Run your Minecraft Bedrock servers on the default port (19132) and map that port to some higher port (e.g. 60601). 

Add the label 'manymine.enable=true' to each server container you wish manymine to connect to. 

Both manymine and your minecraft servers need to be on the same docker network.

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
    volumes:
      - minecraft-a-data:/data
    ports:
      - '60601:19132/udp'
    labels:
      - manymine.enable=true

  minecraft-b:
    image: itzg/minecraft-bedrock-server
    container_name: minecraft-b
    environment:
      - EULA=TRUE
      - SERVER_NAME=Server B
    volumes:
      - minecraft-b-data:/data
    ports:
      - '60602:19132/udp'
    labels:
      - manymine.enable=true

volumes:
  minecraft-a-data:
  minecraft-b-data:
```
