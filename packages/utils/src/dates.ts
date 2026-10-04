/** Date/time helpers. The backend stores and reasons in UTC; presentation
 * converts to the restaurant timezone using `Intl`. */

export const nowDate = (): Date => new Date();

export const toIso = (date: Date = nowDate()): string => date.toISOString();

export const addSeconds = (date: Date, seconds: number): Date =>
  new Date(date.getTime() + seconds * 1000);

export const isExpired = (date: Date, now: Date = nowDate()): boolean =>
  date.getTime() <= now.getTime();

export const secondsBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / 1000);

/** ISO date (YYYY-MM-DD) for a given instant in a timezone. */
export const toBusinessDate = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  return parts;
};

/** Start of the business day (UTC instant) for a timezone. */
export const startOfBusinessDay = (date: Date, timeZone: string): Date => {
  const businessDate = toBusinessDate(date, timeZone);
  const [year = '1970', month = '01', day = '01'] = businessDate.split('-');
  // Determine the timezone offset at that instant and remove it.
  const utcGuess = Date.parse(`${year}-${month}-${day}T00:00:00.000Z`);
  const offset = timezoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
};

/** Offset in ms of `timeZone` from UTC at the given instant. */
export const timezoneOffsetMs = (date: Date, timeZone: string): number => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour') % 24,
    lookup('minute'),
    lookup('second')
  );
  return asUtc - date.getTime();
};
