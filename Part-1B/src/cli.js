// CLI entry: stdin → runAgent → exactly one JSON line on stdout, AGENT_DIAG on stderr (FR-01, FR-07).
import { pathToFileURL } from 'node:url';
import { runAgent } from './agent.js';

async function readAll(stdin) {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function main({ argv, stdin, stdout, stderr, env, modelClient, sleep }) {
  const message = await readAll(stdin);
  const { output, exitCode, diag, stderrMessage } = await runAgent({ argv, message, env, modelClient, sleep });
  stdout.write(JSON.stringify(output) + '\n');
  if (stderrMessage) {
    stderr.write(stderrMessage + '\n');
  }
  stderr.write('AGENT_DIAG ' + JSON.stringify(diag) + '\n');
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  process.exitCode = await main({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    sleep,
  });
}
