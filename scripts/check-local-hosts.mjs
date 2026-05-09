import { readFileSync } from 'fs';

const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const expected = '127.0.0.1 synthnews.local';

let content = '';
try {
  content = readFileSync(hostsPath, 'utf8');
} catch (err) {
  console.error(`Cannot read ${hostsPath}: ${err.message}`);
  process.exit(1);
}

const hasEntry = content
  .split(/\r?\n/)
  .map((line) => line.trim())
  .some((line) => !line.startsWith('#') && /^127\.0\.0\.1\s+synthnews\.local(?:\s|$)/i.test(line));

if (hasEntry) {
  console.log('OK: hosts has 127.0.0.1 synthnews.local');
  process.exit(0);
}

console.log('Missing hosts entry. Add this line as Administrator:');
console.log(expected);
process.exit(1);
