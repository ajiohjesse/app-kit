export type TimerId = number;

type ScheduledTask = {
  id: TimerId;
  runAt: number;
  callback: () => void;
};

/** A deterministic timer boundary for contracts that must not depend on wall time. */
export class FakeClock {
  private currentTime = 0;
  private nextId = 1;
  private tasks = new Map<TimerId, ScheduledTask>();

  now = () => this.currentTime;

  setTimeout = (callback: () => void, delay = 0): TimerId => {
    const id = this.nextId++;
    this.tasks.set(id, { id, callback, runAt: this.currentTime + Math.max(0, delay) });
    return id;
  };

  clearTimeout = (id: TimerId) => {
    this.tasks.delete(id);
  };

  advanceBy = (milliseconds: number) => {
    if (milliseconds < 0) throw new Error("FakeClock cannot move backwards");

    const target = this.currentTime + milliseconds;
    while (true) {
      const next = [...this.tasks.values()]
        .filter((task) => task.runAt <= target)
        .sort((left, right) => left.runAt - right.runAt || left.id - right.id)[0];
      if (!next) break;

      this.currentTime = next.runAt;
      this.tasks.delete(next.id);
      next.callback();
    }
    this.currentTime = target;
  };
}
