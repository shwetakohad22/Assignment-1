import http from 'node:http';
import { loadConfig } from './config.js';
import { createStore, loadTasks } from './store.js';
import { createApp } from './app.js';

function fail(err) {
  const reason = err && err.message ? err.message : String(err);
  process.stderr.write(`Failed to start: ${reason}\n`);
  process.exitCode = 1;
}

function registerShutdown(server, store) {
  let closing = false;
  const shutdown = async () => {
    if (closing) {
      return;
    }
    closing = true;
    server.close();
    await store.idle();
    process.exitCode = 0;
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function main() {
  const { port, host, dataFile } = loadConfig();
  const tasks = await loadTasks(dataFile);
  const store = createStore(dataFile, tasks);
  const server = http.createServer(createApp(store));

  server.once('error', fail);
  server.once('listening', () => {
    const actualPort = server.address().port;
    process.stdout.write(`Listening on http://${host}:${actualPort}\n`);
    registerShutdown(server, store);
  });
  server.listen(port, host);
}

main().catch(fail);
