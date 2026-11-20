/** Save only the reading returned by this user's explicit Android sync action. */
export async function saveFreshAndroidSteps({ date, toDateKey, read, save }) {
  const day = toDateKey(date);
  const result = await read(date);
  if (!result?.available || result.permission !== 'granted' || result.error
    || !Number.isInteger(result.steps) || result.steps <= 0) return null;
  return await save(day, result.steps);
}
