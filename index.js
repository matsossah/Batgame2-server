import { resolve as r } from 'path';
import express from 'express';
import { ParseServer } from 'parse-server';

const {
  DATABASE_URI,
  MONGODB_URI,
  APP_ID,
  CLIENT_KEY,
  MASTER_KEY,
  HOST,
  PORT,
} = process.env;

const serverURL = `http://${HOST}:${PORT}/parse`;

const api = new ParseServer({
  cloud: r('./cloud/main.js'),
  databaseURI: DATABASE_URI || MONGODB_URI,
  appId: APP_ID,
  clientKey: CLIENT_KEY,
  masterKey: MASTER_KEY,
  serverURL,
});

const app = express();

app.use('/parse', api);

const server = require('http').createServer(app);
server.listen(PORT, () => {
  console.log(`Parse server running on ${serverURL}`);
});

ParseServer.createLiveQueryServer(server);
