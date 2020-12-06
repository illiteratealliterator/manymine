# manymine
A simple way to run multiple Minecraft Bedrock servers in docker containers on the same host, and be able to discover them as LAN games.

## Environment parameters

**MM_HOST**  
This is the IP or name of the host which is running Manymine and your Minecraft servers  
e.g. MM_HOST=192.168.0.10

**MM_SERVER_PORTS**  
Any array of the ports your Minecraft servers are running on  
e.g. MM_SERVER_PORTS=[60601, 60602]

## Docker Compose
Using docker compose, you'll want something like this:
```
version: "3.7"
services:
  manymine:
    image: illiteratealliterator/manymine
    container_name: manymine
    environment:
      - MM_HOST=192.168.0.10
      - MM_SERVER_PORTS=[60601, 60602]
    ports:
      - '19132:19132/udp'

  minecraft-a:
    image: itzg/minecraft-bedrock-server
    environment:
      - EULA=TRUE
      - SERVER_NAME=Server A
    volumes:
      - minecraft-a-data:/data
    ports:
      - '60601:19132/udp'

  minecraft-b:
    image: itzg/minecraft-bedrock-server
    environment:
      - EULA=TRUE
      - SERVER_NAME=Server B
    volumes:
      - minecraft-b-data:/data
    ports:
      - '60602:19132/udp'

volumes:
  minecraft-a-data:
  minecraft-b-data:
```
