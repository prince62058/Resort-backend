import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
import {GridFSBucket, MongoClient} from 'mongodb';

dotenv.config({path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true});

let connection;
let client;

export function databaseConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

export async function getMediaStore() {
  if (!databaseConfigured()) throw new Error('Set the server-only MONGODB_URI environment variable.');
  if (!connection) {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      maxPoolSize: 8,
    });
    connection = client.connect().then(() => {
      const db = client.db(process.env.MONGODB_DB || 'nature_nest');
      const bucketName = process.env.MEDIA_BUCKET || 'resort_media';
      return {
        db,
        assets: db.collection('media_assets'),
        files: db.collection(`${bucketName}.files`),
        bucket: new GridFSBucket(db, {bucketName}),
      };
    }).catch(async error => {
      await client.close();
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

export async function closeMediaStore() {
  await client?.close();
  connection = undefined;
}
