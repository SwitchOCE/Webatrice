import { execFileSync } from 'node:child_process';

export function queryServerDb(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', 'webatrice-e2e-mysql-1', 'mysql', '-uservatrice', '-ppassword', 'servatrice', '-N', '-e', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}
