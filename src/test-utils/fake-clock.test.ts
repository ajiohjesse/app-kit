import { describe, expect, it } from "vitest";
import { FakeClock } from "./fake-clock";

describe("FakeClock", () => {
  it("runs due timers in time and registration order", () => {
    const clock = new FakeClock();
    const calls: string[] = [];
    clock.setTimeout(() => calls.push("later"), 20);
    clock.setTimeout(() => calls.push("first"), 10);
    clock.setTimeout(() => calls.push("second"), 10);

    clock.advanceBy(10);
    expect(calls).toEqual(["first", "second"]);
    expect(clock.now()).toBe(10);

    clock.advanceBy(10);
    expect(calls).toEqual(["first", "second", "later"]);
  });
});
