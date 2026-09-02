import { describe, expect, it } from "vitest";

import {
  WorkflowTaskPlanError,
  admitWorkflowTaskPlan,
  selectRunnableWorkflowTasks,
  type WorkflowTaskPlan,
  type WorkflowTaskStateSnapshot,
} from "../src/workflow-task-execution/task-plan";

const boundedPlan = (): WorkflowTaskPlan => ({
  executionId: "exec-review-regression",
  planId: "plan-review-regression",
  maxConcurrency: 1,
  tasks: [
    { taskId: "first", dependsOn: [], effect: "pure" },
    { taskId: "second", dependsOn: ["first"], effect: "idempotent" },
  ],
});

const boundedStates = (): WorkflowTaskStateSnapshot[] => [
  {
    executionId: "exec-review-regression",
    planId: "plan-review-regression",
    taskId: "first",
    state: "succeeded",
  },
  {
    executionId: "exec-review-regression",
    planId: "plan-review-regression",
    taskId: "second",
    state: "pending",
  },
];

const rejectIteration = (values: unknown[]): void => {
  Object.defineProperty(values, Symbol.iterator, {
    configurable: true,
    value: () => {
      throw new Error("untrusted iterator must not be consumed");
    },
  });
};

describe("Workflow / Task Execution review regressions", () => {
  it("rejects retained state that already exceeds the admitted concurrency bound", () => {
    const admitted = admitWorkflowTaskPlan(boundedPlan());
    const states: WorkflowTaskStateSnapshot[] = [
      {
        executionId: admitted.executionId,
        planId: admitted.planId,
        taskId: "first",
        state: "running",
      },
      {
        executionId: admitted.executionId,
        planId: admitted.planId,
        taskId: "second",
        state: "running",
      },
    ];

    expect(() => selectRunnableWorkflowTasks(admitted, states)).toThrowError(
      /running task state exceeds admitted maxConcurrency/i,
    );
  });

  it("rejects task-state evidence from another execution before releasing work", () => {
    const admitted = admitWorkflowTaskPlan(boundedPlan());
    const states = boundedStates();
    states[1] = { ...states[1], executionId: "exec-review-attacker" };

    expect(() => selectRunnableWorkflowTasks(admitted, states)).toThrowError(
      /execution identity does not match admitted execution identity/i,
    );
  });

  it("uses validated array bounds instead of caller-controlled iterators", () => {
    const candidate = boundedPlan();
    const tasks = candidate.tasks as WorkflowTaskPlan["tasks"] & unknown[];
    const dependencies = candidate.tasks[1].dependsOn as readonly string[] & unknown[];
    rejectIteration(tasks);
    rejectIteration(dependencies);

    const admitted = admitWorkflowTaskPlan(candidate);
    const states = boundedStates();
    rejectIteration(states);

    expect(selectRunnableWorkflowTasks(admitted, states)).toEqual(["second"]);
  });

  it("retains the empty result only for a saturated but valid state vector", () => {
    const admitted = admitWorkflowTaskPlan(boundedPlan());
    const states = boundedStates();
    states[1] = { ...states[1], state: "running" };

    expect(selectRunnableWorkflowTasks(admitted, states)).toEqual([]);
    expect(() => selectRunnableWorkflowTasks(admitted, states)).not.toThrow(
      WorkflowTaskPlanError,
    );
  });
});
