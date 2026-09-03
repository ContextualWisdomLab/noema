import { describe, expect, it } from "vitest";

import {
  MAX_TASK_DEPENDENCIES,
  WorkflowTaskPlanError,
  admitWorkflowTaskPlan,
  selectRunnableWorkflowTasks,
  type WorkflowTaskPlan,
  type WorkflowTaskStateSnapshot,
} from "../src/workflow-task-execution/task-plan";

function boundedPlan(): WorkflowTaskPlan {
  return {
    executionId: "exec-workflow-boundary-001",
    planId: "plan-workflow-boundary-001",
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
  planId = "plan-workflow-boundary-001",
): WorkflowTaskStateSnapshot {
  return { executionId, planId, taskId, state: taskState };
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

  it("binds task-state evidence to the exact admitted plan identity", () => {
    const admitted = admitWorkflowTaskPlan(boundedPlan());

    expect(() =>
      selectRunnableWorkflowTasks(admitted, [
        state("prepare", "succeeded", admitted.executionId, "plan-stale-revision"),
        state("publish", "pending", admitted.executionId, "plan-stale-revision"),
        state("observe", "pending", admitted.executionId, "plan-stale-revision"),
      ]),
    ).toThrowError(/plan identity/i);
  });

  it("reads each plan and nested task field once before validation", () => {
    const reads = { planId: 0, taskId: 0, effect: 0, dependsOn: 0 };
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
    const candidate = Object.defineProperties({}, {
      executionId: { enumerable: true, get: () => "exec-getter-snapshot" },
      planId: {
        enumerable: true,
        get: () => {
          reads.planId += 1;
          return reads.planId === 1 ? "plan-getter-snapshot" : "plan-attacker";
        },
      },
      maxConcurrency: { enumerable: true, get: () => 1 },
      tasks: { enumerable: true, get: () => [task] },
    }) as WorkflowTaskPlan;

    expect(admitWorkflowTaskPlan(candidate)).toEqual({
      executionId: "exec-getter-snapshot",
      planId: "plan-getter-snapshot",
      maxConcurrency: 1,
      tasks: [{ taskId: "prepare", dependsOn: [], effect: "pure" }],
    });
    expect(reads).toEqual({ planId: 1, taskId: 1, effect: 1, dependsOn: 1 });
  });

  it("normalizes nested task accessor failures into the workflow domain error", () => {
    const hostileTask = Object.defineProperty({}, "taskId", {
      enumerable: true,
      get: () => {
        throw new Error("hostile task accessor");
      },
    });
    Object.assign(hostileTask, { effect: "pure", dependsOn: [] });

    expect(() =>
      admitWorkflowTaskPlan({
        executionId: "exec-hostile-task",
        planId: "plan-hostile-task",
        maxConcurrency: 1,
        tasks: [hostileTask as unknown as WorkflowTaskPlan["tasks"][number]],
      }),
    ).toThrow(WorkflowTaskPlanError);
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
      planId: "plan-index-bounds",
      maxConcurrency: 1,
      tasks,
    });

    const currentStates = [state("prepare", "pending", "exec-index-bounds", "plan-index-bounds")];
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
      planId: "plan-over-concurrency",
      maxConcurrency: 1,
    });

    expect(() =>
      selectRunnableWorkflowTasks(admitted, [
        state("prepare", "succeeded", "exec-over-concurrency", "plan-over-concurrency"),
        state("publish", "running", "exec-over-concurrency", "plan-over-concurrency"),
        state("observe", "running", "exec-over-concurrency", "plan-over-concurrency"),
      ]),
    ).toThrowError(WorkflowTaskPlanError);
  });

  it("snapshots state accessors exactly once before selection", () => {
    const admitted = admitWorkflowTaskPlan({
      ...boundedPlan(),
      executionId: "exec-state-getters",
      planId: "plan-state-getters",
    });
    const reads = { executionId: 0, planId: 0, taskId: 0, state: 0 };
    const prepare = Object.defineProperties({}, {
      executionId: {
        enumerable: true,
        get: () => {
          reads.executionId += 1;
          return reads.executionId === 1 ? "exec-state-getters" : "exec-other-run";
        },
      },
      planId: {
        enumerable: true,
        get: () => {
          reads.planId += 1;
          return reads.planId === 1 ? "plan-state-getters" : "plan-other-revision";
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
        state("publish", "pending", "exec-state-getters", "plan-state-getters"),
        state("observe", "pending", "exec-state-getters", "plan-state-getters"),
      ]),
    ).toEqual(["publish", "observe"]);
    expect(reads).toEqual({ executionId: 1, planId: 1, taskId: 1, state: 1 });
  });

  it("rejects a task whose effect is not canonical", () => {
    expect(() =>
      admitWorkflowTaskPlan({
        ...boundedPlan(),
        tasks: [
          {
            taskId: "prepare",
            dependsOn: [],
            effect: "not-a-real-effect" as unknown as WorkflowTaskPlan["tasks"][number]["effect"],
          },
        ],
      }),
    ).toThrowError(/task effect is not canonical/i);
  });

  it("rejects a non-object top-level plan candidate", () => {
    expect(() => admitWorkflowTaskPlan(null as unknown as WorkflowTaskPlan)).toThrowError(
      /workflow task plan must be an object/i,
    );
    expect(() => admitWorkflowTaskPlan("not-a-plan" as unknown as WorkflowTaskPlan)).toThrowError(
      /workflow task plan must be an object/i,
    );
  });

  it("rejects a plan whose tasks field is not an array", () => {
    expect(() =>
      admitWorkflowTaskPlan({
        ...boundedPlan(),
        tasks: "not-an-array" as unknown as WorkflowTaskPlan["tasks"],
      }),
    ).toThrowError(/tasks must contain between 1 and/i);
  });

  it("rejects a plan with zero tasks", () => {
    expect(() => admitWorkflowTaskPlan({ ...boundedPlan(), tasks: [] })).toThrowError(
      /tasks must contain between 1 and/i,
    );
  });

  it("rejects a task entry that is not an object", () => {
    expect(() =>
      admitWorkflowTaskPlan({
        ...boundedPlan(),
        tasks: ["not-an-object" as unknown as WorkflowTaskPlan["tasks"][number]],
      }),
    ).toThrowError(/workflow task must be an object/i);
  });

  it("rejects a task whose dependsOn field is not an array", () => {
    expect(() =>
      admitWorkflowTaskPlan({
        ...boundedPlan(),
        tasks: [
          {
            taskId: "prepare",
            dependsOn: "not-an-array" as unknown as readonly string[],
            effect: "pure",
          },
        ],
      }),
    ).toThrowError(/task dependencies must contain at most/i);
  });

  it("rejects a task declaring more dependencies than the bound permits", () => {
    const dependsOn = Array.from(
      { length: MAX_TASK_DEPENDENCIES + 1 },
      (_, index) => `dep-${index}`,
    );

    expect(() =>
      admitWorkflowTaskPlan({
        ...boundedPlan(),
        tasks: [{ taskId: "prepare", dependsOn, effect: "pure" }],
      }),
    ).toThrowError(/task dependencies must contain at most/i);
  });

  it("rejects a task with a duplicate dependency entry", () => {
    expect(() =>
      admitWorkflowTaskPlan({
        ...boundedPlan(),
        tasks: [
          { taskId: "prepare", dependsOn: [], effect: "pure" },
          { taskId: "publish", dependsOn: ["prepare", "prepare"], effect: "pure" },
        ],
      }),
    ).toThrowError(/duplicate task dependency/i);
  });

  it("rejects task-state evidence that is not an array", () => {
    const admitted = admitWorkflowTaskPlan(boundedPlan());

    expect(() =>
      selectRunnableWorkflowTasks(
        admitted,
        "not-an-array" as unknown as readonly WorkflowTaskStateSnapshot[],
      ),
    ).toThrowError(/task state evidence must contain exactly one entry/i);
  });

  it("rejects a task-state entry that is not an object", () => {
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-single-task",
      planId: "plan-single-task",
      maxConcurrency: 1,
      tasks: [{ taskId: "only", dependsOn: [], effect: "pure" }],
    });

    expect(() =>
      selectRunnableWorkflowTasks(admitted, [42 as unknown as WorkflowTaskStateSnapshot]),
    ).toThrowError(/task state evidence must be an object/i);
  });

  it("normalizes state accessor failures into the workflow domain error", () => {
    const admitted = admitWorkflowTaskPlan(boundedPlan());
    const hostileState = Object.defineProperties({}, {
      executionId: { enumerable: true, value: admitted.executionId },
      planId: { enumerable: true, value: admitted.planId },
      taskId: { enumerable: true, value: "prepare" },
      state: {
        enumerable: true,
        get: () => {
          throw new Error("hostile state accessor");
        },
      },
    }) as WorkflowTaskStateSnapshot;

    expect(() =>
      selectRunnableWorkflowTasks(admitted, [
        hostileState,
        state("publish", "pending"),
        state("observe", "pending"),
      ]),
    ).toThrow(WorkflowTaskPlanError);
  });
});
