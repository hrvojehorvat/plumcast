/**
 * Long work on the JS thread (parsing a big TV guide, saving 100k rows) blocks the remote: key
 * presses wait until it's done. A breather gives the UI a moment whenever the work has run for
 * `budgetMs` since the last break; cheap to call often.
 */
export function createBreather(budgetMs = 12, now: () => number = Date.now, pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0))) {
  let since = now();
  return async (): Promise<void> => {
    if (now() - since < budgetMs) return;
    await pause();
    since = now();
  };
}
