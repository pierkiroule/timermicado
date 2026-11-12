// A meeting's deadline is immutable. Pauses consume the shared time budget.
export const remainingTime = (state, now) =>
  state.finishedAt != null ? 0 : Math.max(0, state.endAt - now);

export const meetingEnd = (state, now) =>
  Math.min(now, state.finishedAt ?? state.endAt, state.endAt);

export const canEditMeeting = (state, now) =>
  state.isConfigured && state.finishedAt == null && now < state.endAt;

export const deadlineForToday = (value, now) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime() > now ? date.getTime() : null;
};
