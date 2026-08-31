'use strict';

const mongoose = require('mongoose');
const config = require('../config');

let connectPromise = null;

/**
 * Connect once and reuse the promise, so repeated calls (server boot + tests)
 * never open competing connections.
 * @param {string} [uri]
 */
function connectDb(uri = config.mongoUri) {
  if (connectPromise) return connectPromise;

  mongoose.set('strictQuery', true);

  connectPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    })
    .then((conn) => {
      // eslint-disable-next-line no-console
      console.log(`[db] connected to ${conn.connection.name}`);
      return conn;
    })
    .catch((err) => {
      connectPromise = null;
      throw err;
    });

  return connectPromise;
}

async function disconnectDb() {
  connectPromise = null;
  await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb, mongoose };
