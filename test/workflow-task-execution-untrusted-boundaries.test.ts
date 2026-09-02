import { describe, expect, it } from "vitest";

import {
  WorkflowTaskPlanError,
  admitWorkflowTaskPlan,
  selectRunnableWorkflowTasks,
  type WorkflowTaskPlan,
  type WorkflowTaskStateSnapshot,
} from "../src/workflow-task-execution/task-plan";

function boundedPlan(): WorkflowTaskPlan {
  return {
    executionId: "exec-workflow-boundary-001",
    maxConcurrency: 2,
    tasks: [
      { taskId: "prepare", dependsOn: [], effect: "pure" },
      { taskId: "publish", dependsOn: ["prepare"], effect: "side_effecting" },
      { taskId: "observe", dependsOn: ["prepare"], effect: "idempotent" },
    ],
  };
}

function state(
  taskId: string,
  taskState: WorkflowTaskStateSnapshot["state"],
  executionId = "exec-workflow-boundary-001",
): WorkflowTaskStateSnapshot {
  return { executionId, taskId, state: taskState };
}

describe("Workflow / Task Execution untrusted-boundary snapshots", () => {
  it("binds task-state evidence to the admitted execution", () => {
    const admitted = admitWorkflowTaskPlan(boundedPlan());

    expect(() =>
      selectRunnableWorkflowTasks(admitted, [
        state("prepare", "succeeded", "exec-other-run"),
        state("publish", "pending", "exec-other-run"),
        state("observe", "pending", "exec-other-run"),
      ]),
    ).toThrowError(/execution identity/i);
  });

  it("reads each plan and nested task field once before validation", () => {
    const reads = { taskId: 0, effect: 0, dependsOn: 0 };
    const task = Object.defineProperties({}, {
      taskId: {
        enumerable: true,
        get: () => {
          reads.taskId += 1;
          return reads.taskId === 1 ? "prepare" : "attacker-task";
        },
      },
      effect: {
        enumerable: true,
        get: () => {
          reads.effect += 1;
          return reads.effect === 1 ? "pure" : "side_effecting";
        },
      },
      dependsOn: {
        enumerable: true,
        get: () => {
          reads.dependsOn += 1;
          return reads.dependsOn === 1 ? [] : ["attacker-dependency"];
        },
      },
    });
    const candidate = {
      executionId: "exec-getter-snapshot",
      maxConcurrency: 1,
      tasks: [task],
    } as unknown as WorkflowTaskPlan;

    expect(admitWorkflowTaskPlan(candidate)).toEqual({
      executionId: "exec-getter-snapshot",
      maxConcurrency: 1,
      tasks: [{ taskId: "prepare", dependsOn: [], effect: "pure" }],
    });
    expect(reads).toEqual({ taskId: 1, effect: 1, dependsOn: 1 });
  });

  it("does not consume custom task, dependency, or state iterators beyond validated lengths", () => {
    const task = { taskId: "prepare", dependsOn: [] as string[], effect: "pure" as const };
    Object.defineProperty(task.dependsOn, Symbol.iterator, {
      configurable: true,
      value: function* hostileDependencies() {
        throw new Error("dependency iterator must not execute");
      },
    });

    const tasks = [task];
    Object.defineProperty(tasks, Symbol.iterator, {
      configurable: true,
      value: function* hostileTasks() {
        yield task;
        throw new Error("task iterator exceeded validated length");
      },
    });

    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-index-bounds",
      maxConcurrency: 1,
      tasks,
    });

    const currentStates = [state("prepare", "pending", "exec-index-bounds")];
    Object.defineProperty(currentStates, Symbol.iterator, {
      configurable: true,
      value: function* hostileStates() {
        yield currentStates[0];
        throw new Error("state iterator exceeded validated length");
      },
    });

    expect(selectRunnableWorkflowTasks(admitted, currentStates)).toEqual(["prepare"]);
  });

  it("rejects retained running state that already exceeds admitted concurrency", () => {
    const admitted = admitWorkflowTaskPlan({
      ...boundedPlan(),
      executionId: "exec-over-concurrency",
      maxConcurrency: 1,
    });

    expect(() =>
      selectRunnableWorkflowTasks(admitted, [
        state("prepare", "succeeded", "exec-over-concurrency"),
        state("publish", "running", "exec-over-concurrency"),
        state("observe", "running", "exec-over-concurrency"),
      ]),
    ).toThrowError(WorkflowTaskPlanError);
  });

  it("snapshots state accessors exactly once before selection", () => {
    const admitted = admitWorkflowTaskPlan({
      ...boundedPlan(),
      executionId: "exec-state-getters",
    });
    const reads = { executionId: 0, taskId: 0, state: 0 };
    const prepare = Object.defineProperties({}, {
      executionId: {
        enumerable: true,
        get: () => {
          reads.executionId += 1;
          return reads.executionId === 1 ? "exec-state-getters" : "exec-other-run";
        },
      },
      taskId: {
        enumerable: true,
        get: () => {
          reads.taskId += 1;
          return reads.taskId === 1 ? "prepare" : "foreign";
        },
      },
      state: {
        enumerable: true,
        get: () => {
          reads.state += 1;
          return reads.state === 1 ? "succeeded" : "failed";
        },
      },
    }) as WorkflowTaskStateSnapshot;

    expect(
      selectRunnableWorkflowTasks(admitted, [
        prepare,
        state("publish", "pending", "exec-state-getters"),
        state("observe", "pending", "exec-state-getters"),
      ]),
    ).toEqual(["publish", "observe"]);
    expect(reads).toEqual({ executionId: 1, taskId: 1, state: 1 });
  });
});
