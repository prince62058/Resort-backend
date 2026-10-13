import {createApp} from './app.js';
import {closeMediaStore, databaseConfigured, getMediaStore} from './database.js';

if (process.env.NODE_ENV === 'production' && !databaseConfigured()) {
  console.error('Set MONGODB_URI in the backend environment before deploying.');
  process.exit(1);
}

const port = Number(process.env.PORT || 5174);
const server = createApp().listen(port, '0.0.0.0', () => console.log(`Nature Nest server listening on port ${port}.`));

if (databaseConfigured()) {
  getMediaStore().then(() => console.log('MongoDB media store connected.'))
    .catch(() => console.error('MongoDB unavailable. Check Atlas network access and backend environment settings.'));
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => {await closeMediaStore(); process.exit(0);});
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
