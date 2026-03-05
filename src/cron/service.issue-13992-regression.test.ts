import { describe, expect, it } from "vitest";
import type { CronJob } from "./types.js";
import { createMockCronStateForJobs } from "./service.test-harness.js";
import { recomputeNextRunsForMaintenance } from "./service/jobs.js";

function createCronSystemEventJob(now: number, overrides: Partial<CronJob> = {}): CronJob {
  const { state, ...jobOverrides } = overrides;
  return {
    id: "test-job",
    name: "test job",
    enabled: true,
    schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
    payload: { kind: "systemEvent", text: "test" },
    sessionTarget: "main",
    wakeMode: "next-heartbeat",
    createdAtMs: now,
    updatedAtMs: now,
    ...jobOverrides,
    state: state ? { ...state } : {},
  };
}

describe("issue #13992 regression - cron jobs skip execution", () => {
  it("should NOT recompute nextRunAtMs for past-due jobs by default", () => {
    const now = Date.now();
    const pastDue = now - 60_000; // 1 minute ago

    const job = createCronSystemEventJob(now, {
      createdAtMs: now - 3600_000,
      updatedAtMs: now - 3600_000,
      state: {
        nextRunAtMs: pastDue, // This is in the past and should NOT be recomputed
      },
    });

    const state = createMockCronStateForJobs({ jobs: [job], nowMs: now });
    recomputeNextRunsForMaintenance(state);

    // Should not have changed the past-due nextRunAtMs
    expect(job.state.nextRunAtMs).toBe(pastDue);
  });

  it("should NOT recompute past-due nextRunAtMs even when slot was already executed", () => {
    // Maintenance never overwrites existing nextRunAtMs values, even when a
    // past-due slot was already executed (lastRunAtMs > nextRunAtMs). The
    // recomputeExpired option was removed; only missing nextRunAtMs is filled.
    const now = Date.now();
    const pastDue = now - 60_000;

    const job: CronJob = {
      id: "test-job",
      name: "test job",
      enabled: true,
      schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
      payload: { kind: "systemEvent", text: "test" },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      createdAtMs: now - 3600_000,
      updatedAtMs: now - 3600_000,
      state: {
        nextRunAtMs: pastDue,
        lastRunAtMs: pastDue + 1000,
      },
    };

    const state = createMockCronStateForJobs({ jobs: [job], nowMs: now });
    recomputeNextRunsForMaintenance(state);

    // Maintenance does not touch existing nextRunAtMs values
    expect(job.state.nextRunAtMs).toBe(pastDue);
  });

  it("should NOT recompute past-due nextRunAtMs for running jobs", () => {
    const now = Date.now();
    const pastDue = now - 60_000;

    const job: CronJob = {
      id: "test-job",
      name: "test job",
      enabled: true,
      schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
      payload: { kind: "systemEvent", text: "test" },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      createdAtMs: now - 3600_000,
      updatedAtMs: now - 3600_000,
      state: {
        nextRunAtMs: pastDue,
        runningAtMs: now - 500,
      },
    };

    const state = createMockCronStateForJobs({ jobs: [job], nowMs: now });
    recomputeNextRunsForMaintenance(state);

    expect(job.state.nextRunAtMs).toBe(pastDue);
  });

  it("should compute missing nextRunAtMs during maintenance", () => {
    const now = Date.now();

    const job = createCronSystemEventJob(now, {
      state: {
        // nextRunAtMs is missing
      },
    });

    const state = createMockCronStateForJobs({ jobs: [job], nowMs: now });
    recomputeNextRunsForMaintenance(state);

    // Should have computed a nextRunAtMs
    expect(typeof job.state.nextRunAtMs).toBe("number");
    expect(job.state.nextRunAtMs).toBeGreaterThan(now);
  });

  it("should clear nextRunAtMs for disabled jobs during maintenance", () => {
    const now = Date.now();
    const futureTime = now + 3600_000;

    const job = createCronSystemEventJob(now, {
      enabled: false, // Disabled
      state: {
        nextRunAtMs: futureTime,
      },
    });

    const state = createMockCronStateForJobs({ jobs: [job], nowMs: now });
    recomputeNextRunsForMaintenance(state);

    // Should have cleared nextRunAtMs for disabled job
    expect(job.state.nextRunAtMs).toBeUndefined();
  });

  it("should clear stuck running markers during maintenance", () => {
    const now = Date.now();
    const stuckTime = now - 3 * 60 * 60_000; // 3 hours ago (> 2 hour threshold)
    const futureTime = now + 3600_000;

    const job = createCronSystemEventJob(now, {
      state: {
        nextRunAtMs: futureTime,
        runningAtMs: stuckTime, // Stuck running marker
      },
    });

    const state = createMockCronStateForJobs({ jobs: [job], nowMs: now });
    recomputeNextRunsForMaintenance(state);

    // Should have cleared stuck running marker
    expect(job.state.runningAtMs).toBeUndefined();
    // But should NOT have changed nextRunAtMs (it's still future)
    expect(job.state.nextRunAtMs).toBe(futureTime);
  });

  it("isolates schedule errors while filling missing nextRunAtMs", () => {
    const now = Date.now();
    const pastDue = now - 1_000;

    const dueJob: CronJob = {
      id: "due-job",
      name: "due job",
      enabled: true,
      schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
      payload: { kind: "systemEvent", text: "due" },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      createdAtMs: now - 3600_000,
      updatedAtMs: now - 3600_000,
      state: {
        nextRunAtMs: pastDue,
      },
    };

    const malformedJob: CronJob = {
      id: "bad-job",
      name: "bad job",
      enabled: true,
      schedule: { kind: "cron", expr: "not a valid cron", tz: "UTC" },
      payload: { kind: "systemEvent", text: "bad" },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      createdAtMs: now - 3600_000,
      updatedAtMs: now - 3600_000,
      state: {
        // missing nextRunAtMs
      },
    };

    const state = createMockCronStateForJobs({ jobs: [dueJob, malformedJob], nowMs: now });

    expect(() => recomputeNextRunsForMaintenance(state)).not.toThrow();
    expect(dueJob.state.nextRunAtMs).toBe(pastDue);
    expect(malformedJob.state.nextRunAtMs).toBeUndefined();
    expect(malformedJob.state.scheduleErrorCount).toBe(1);
    expect(malformedJob.state.lastError).toMatch(/^schedule error:/);
  });

  it("does not recompute past-due nextRunAtMs for any jobs, regardless of execution state", () => {
    // Maintenance never modifies existing nextRunAtMs values. Both already-executed
    // and never-executed jobs retain their past-due nextRunAtMs.
    const now = Date.now();
    const pastDue = now - 60_000;
    const alreadyExecuted: CronJob = {
      id: "already-executed",
      name: "already executed",
      enabled: true,
      schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
      payload: { kind: "systemEvent", text: "done" },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      createdAtMs: now - 86400_000,
      updatedAtMs: now - 86400_000,
      state: {
        nextRunAtMs: pastDue,
        lastRunAtMs: pastDue + 1000,
      },
    };

    const neverExecuted: CronJob = {
      id: "never-executed",
      name: "never executed",
      enabled: true,
      schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
      payload: { kind: "systemEvent", text: "pending" },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      createdAtMs: now - 86400_000 * 2,
      updatedAtMs: now - 86400_000 * 2,
      state: {
        nextRunAtMs: pastDue,
        lastRunAtMs: pastDue - 86400_000,
      },
    };

    const state = createMockCronStateForJobs({
      jobs: [alreadyExecuted, neverExecuted],
      nowMs: now,
    });
    recomputeNextRunsForMaintenance(state);

    expect(alreadyExecuted.state.nextRunAtMs).toBe(pastDue);
    expect(neverExecuted.state.nextRunAtMs).toBe(pastDue);
  });

  it("does not advance overdue never-executed jobs when stale running marker is cleared", () => {
    const now = Date.now();
    const pastDue = now - 60_000;
    const staleRunningAt = now - 3 * 60 * 60_000;

    const job: CronJob = {
      id: "stale-running-overdue",
      name: "stale running overdue",
      enabled: true,
      schedule: { kind: "cron", expr: "0 8 * * *", tz: "UTC" },
      payload: { kind: "systemEvent", text: "test" },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      createdAtMs: now - 86400_000,
      updatedAtMs: now - 86400_000,
      state: {
        nextRunAtMs: pastDue,
        runningAtMs: staleRunningAt,
        lastRunAtMs: pastDue - 3600_000,
      },
    };

    const state = createMockCronStateForJobs({ jobs: [job], nowMs: now });
    recomputeNextRunsForMaintenance(state);

    expect(job.state.runningAtMs).toBeUndefined();
    expect(job.state.nextRunAtMs).toBe(pastDue);
  });
});
