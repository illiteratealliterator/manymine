# manymine
Tool that helps LAN discovery of multiple Minecraft Bedrock servers hosted on a single machine.

For now, here's a working example:

```
version: "3.7"
services:
  minecraft-creative:
    image: itzg/minecraft-bedrock-server
    container_name: minecraft-creative
    environment:
      - UID=1000
      - GID=1000
      - EULA=TRUE
      - SERVER_NAME=Creative
      - GAMEMODE=creative
      - DIFFICULTY=peaceful
      - LEVEL_TYPE=flat
      - ONLINE_MODE=false
      - ALLOW_CHEATS=true
      - SERVER_PORT=60601
    volumes:
      - /var/lib/minecraft-creative:/data
    networks:
      - minecraft-network
    ports:
      - '60601:60601/udp'
    restart: always
    stdin_open: true
    tty: true

  minecraft-survival:
    image: itzg/minecraft-bedrock-server
    container_name: minecraft-survival
    environment:
      - UID=1000
      - GID=1000
      - EULA=TRUE
      - SERVER_NAME=Survival
      - GAMEMODE=survival
      - DIFFICULTY=easy
      - LEVEL_TYPE=default
      - ONLINE_MODE=false
      - ALLOW_CHEATS=true
      - LEVEL_SEED=1935762385
      - SERVER_PORT=60602
    volumes:
      - /var/lib/minecraft-survival:/data
    networks:
      - minecraft-network
    ports:
      - '60602:60602/udp'
    restart: always
    stdin_open: true
    tty: true

  manymine:
    image: illiteratealliterator/manymine
    container_name: manymine
    environment:
      - MM_SERVERS=["minecraft-creative:60601", "minecraft-survival:60602"]
    networks:
      - minecraft-network
    ports:
      - '19132:19132/udp'
    restart: always
    stdin_open: true
    tty: true

networks:
  minecraft-network:
```
