import { cp, rm } from 'node:fs/promises';
await rm(new URL('../public', import.meta.url), { recursive: true, force: true });
await cp(new URL('../web', import.meta.url), new URL('../public', import.meta.url), { recursive: true });
console.log('Arcade assets prepared for hosted deployment.');
