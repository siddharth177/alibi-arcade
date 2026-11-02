const origin = process.env.ALIBI_API_ORIGIN || 'https://alibi-arcade.siddharthreads17.chatgpt.site';
try {
  const response = await fetch(new URL('/api/health', origin), {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('The shared room service requires sign-in. Its owner must allow the intended players before deploying the Pages frontend.');
  }
  if (!response.ok) throw new Error(`The room service returned HTTP ${response.status}.`);
  const result = await response.json();
  if (!result.ok || result.game !== 'alibi-arcade') throw new Error('The endpoint did not return an Alibi Arcade health response.');
  console.log('Room service is available without sign-in.');
} catch (error) {
  console.error('Pages deployment paused:', error.message);
  process.exitCode = 1;
}
