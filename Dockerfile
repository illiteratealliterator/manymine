FROM node:12

WORKDIR /usr/src/app

COPY package*.json ./

#RUN npm install
RUN npm ci --only=production

COPY . .

CMD [ "node", "index.js" ]
