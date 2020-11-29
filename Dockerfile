FROM node:12-alpine

WORKDIR /usr/src/app

COPY package*.json ./

#RUN npm install
RUN npm ci --only=production

COPY . .

CMD [ "node", "index.js" ]
