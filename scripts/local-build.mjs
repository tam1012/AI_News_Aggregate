import { cp, rm } from 'fs/promises';

await rm('server/public', { recursive: true, force: true });
await cp('client/dist', 'server/public', { recursive: true });

console.log('Copied client/dist to server/public');
