const MILLISECONDS_PER_DAY = 86_400_000;
const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000;

export const businessDay = (daysAgo = 0) =>
  new Date(Date.now() + SAO_PAULO_OFFSET_MS - daysAgo * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
