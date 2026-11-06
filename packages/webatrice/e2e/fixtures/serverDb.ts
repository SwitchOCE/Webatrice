import { execFileSync } from 'node:child_process';

export function queryServerDb(sql: string): string {
  return execFileSync('docker', [
    'compose', '--env-file', '../../.env.e2e', '--env-file', '.env.e2e',
    '-f', '../../docker/servatrice/docker-compose.e2e.yml',
    'exec', '-T', 'mysql', 'mysql', '-uservatrice', '-ppassword', 'servatrice', '-N', '-e', sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
