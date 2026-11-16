/** Keep a submission pending for inspection. Unmounting the story discards it. */
export function pendingStorySubmission(): Promise<void> {
  return new Promise<void>(() => {});
}
