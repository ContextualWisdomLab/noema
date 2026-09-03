import { describe, expect, it } from "vitest";

import {
  WorkflowTaskPlanError,
  admitWorkflowTaskPlan,
  selectRunnableWorkflowTasks,
  type WorkflowTaskPlan,
  type WorkflowTaskStateSnapshot,
} from "../src/workflow-task-execution/task-plan";

const plan = (): WorkflowTaskPlan => ({
  executionId: "exec-workflow-001",
  planId: "plan-workflow-001",
  maxConcurrency: 2,
  tasks: [
    { taskId: "prepare", dependsOn: [], effect: "pure" },
    { taskId: "publish", dependsOn: ["prepare"], effect: "side_effecting" },
    { taskId: "observe", dependsOn: ["prepare"], effect: "idempotent" },
  ],
});

const states = (
  prepare: WorkflowTaskStateSnapshot["state"],
  publish: WorkflowTaskStateSnapshot["state"],
  observe: WorkflowTaskStateSnapshot["state"],
): WorkflowTaskStateSnapshot[] => [
  { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "prepare", state: prepare },
  { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "publish", state: publish },
  { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "observe", state: observe },
];

describe("Workflow / Task Execution plan admission", () => {
  it("detaches and freezes the admitted DAG from caller-owned aliases", () => {
    const candidate = plan();
    const admitted = admitWorkflowTaskPlan(candidate);

    (candidate.tasks[0] as { taskId: string }).taskId = "attacker-rewrite";
    (candidate.tasks[1].dependsOn as string[]).push("attacker-dependency");
    candidate.maxConcurrency = 9;

    expect(admitted).toEqual({
      executionId: "exec-workflow-001",
      planId: "plan-workflow-001",
      maxConcurrency: 2,
      tasks: [
        { taskId: "prepare", dependsOn: [], effect: "pure" },
        { taskId: "publish", dependsOn: ["prepare"], effect: "side_effecting" },
        { taskId: "observe", dependsOn: ["prepare"], effect: "idempotent" },
      ],
    });
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted.tasks)).toBe(true);
    expect(Object.isFrozen(admitted.tasks[1])).toBe(true);
    expect(Object.isFrozen(admitted.tasks[1].dependsOn)).toBe(true);
  });

  it("rejects duplicate, unknown, self, and cyclic dependencies", () => {
    expect(() =>
      admitWorkflowTaskPlan({
        executionId: "exec-duplicate",
        planId: "plan-duplicate",
        maxConcurrency: 1,
        tasks: [
          { taskId: "same", dependsOn: [], effect: "pure" },
          { taskId: "same", dependsOn: [], effect: "pure" },
        ],
      }),
    ).toThrowError(/duplicate task identity/i);

    expect(() =>
      admitWorkflowTaskPlan({
        executionId: "exec-unknown",
        planId: "plan-unknown",
        maxConcurrency: 1,
        tasks: [{ taskId: "a", dependsOn: ["missing"], effect: "pure" }],
      }),
    ).toThrowError(/unknown dependency/i);

    expect(() =>
      admitWorkflowTaskPlan({
        executionId: "exec-self",
        planId: "plan-self",
        maxConcurrency: 1,
        tasks: [{ taskId: "a", dependsOn: ["a"], effect: "pure" }],
      }),
    ).toThrowError(/depend on itself/i);

    expect(() =>
      admitWorkflowTaskPlan({
        executionId: "exec-cycle",
        planId: "plan-cycle",
        maxConcurrency: 1,
        tasks: [
          { taskId: "a", dependsOn: ["b"], effect: "pure" },
          { taskId: "b", dependsOn: ["a"], effect: "pure" },
        ],
      }),
    ).toThrowError(/cycle/i);
  });

  it("admits a task whose readiness accumulates across multiple prerequisites", () => {
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-multi-dependency",
      planId: "plan-multi-dependency",
      maxConcurrency: 2,
      tasks: [
        { taskId: "left", dependsOn: [], effect: "pure" },
        { taskId: "right", dependsOn: [], effect: "pure" },
        { taskId: "merge", dependsOn: ["left", "right"], effect: "pure" },
      ],
    });

    expect(admitted.tasks).toEqual([
      { taskId: "left", dependsOn: [], effect: "pure" },
      { taskId: "right", dependsOn: [], effect: "pure" },
      { taskId: "merge", dependsOn: ["left", "right"], effect: "pure" },
    ]);
  });

  it("rejects runtime coercion and unbounded concurrency inputs", () => {
    const unsafeExecution = plan() as unknown as { executionId: unknown };
    unsafeExecution.executionId = { toString: () => "exec-forged" };
    expect(() => admitWorkflowTaskPlan(unsafeExecution as WorkflowTaskPlan)).toThrowError(
      /execution identity/i,
    );

    const unsafePlanId = plan() as unknown as { planId: unknown };
    unsafePlanId.planId = ["plan-forged"];
    expect(() => admitWorkflowTaskPlan(unsafePlanId as WorkflowTaskPlan)).toThrowError(
      /plan identity/i,
    );

    const unsafeTask = plan();
    (unsafeTask.tasks[0] as unknown as { taskId: unknown }).taskId = ["prepare"];
    expect(() => admitWorkflowTaskPlan(unsafeTask)).toThrowError(/task identity/i);

    expect(() => admitWorkflowTaskPlan({ ...plan(), maxConcurrency: 0 })).toThrowError(
      /maxConcurrency/i,
    );
    expect(() => admitWorkflowTaskPlan({ ...plan(), maxConcurrency: 65 })).toThrowError(
      /maxConcurrency/i,
    );
  });

  it("snapshots authority-bearing plan and task getters exactly once", () => {
    const reads = { executionId: 0, planId: 0, maxConcurrency: 0, tasks: 0, dependsOn: 0 };
    const task = Object.defineProperties({}, {
      taskId: { enumerable: true, get: () => "prepare" },
      effect: { enumerable: true, get: () => "pure" },
      dependsOn: {
        enumerable: true,
        get: () => {
          reads.dependsOn += 1;
          return reads.dependsOn === 1 ? [] : ["attacker-dependency"];
        },
      },
    });
    const candidate = Object.defineProperties({}, {
      executionId: {
        enumerable: true,
        get: () => {
          reads.executionId += 1;
          return reads.executionId === 1 ? "exec-stable" : "exec-attacker";
        },
      },
      planId: {
        enumerable: true,
        get: () => {
          reads.planId += 1;
          return reads.planId === 1 ? "plan-stable" : "plan-attacker";
        },
      },
      maxConcurrency: {
        enumerable: true,
        get: () => {
          reads.maxConcurrency += 1;
          return reads.maxConcurrency === 1 ? 1 : 65;
        },
      },
      tasks: {
        enumerable: true,
        get: () => {
          reads.tasks += 1;
          return reads.tasks === 1 ? [task] : [];
        },
      },
    }) as WorkflowTaskPlan;

    expect(admitWorkflowTaskPlan(candidate)).toEqual({
      executionId: "exec-stable",
      planId: "plan-stable",
      maxConcurrency: 1,
      tasks: [{ taskId: "prepare", dependsOn: [], effect: "pure" }],
    });
    expect(reads).toEqual({ executionId: 1, planId: 1, maxConcurrency: 1, tasks: 1, dependsOn: 1 });
  });

  it("normalizes hostile accessor failures into the workflow domain error", () => {
    const candidate = Object.defineProperties({}, {
      executionId: {
        enumerable: true,
        get: () => {
          throw new Error("hostile accessor");
        },
      },
      planId: { enumerable: true, value: "plan-hostile" },
      maxConcurrency: { enumerable: true, value: 1 },
      tasks: { enumerable: true, value: [{ taskId: "a", dependsOn: [], effect: "pure" }] },
    }) as WorkflowTaskPlan;

    expect(() => admitWorkflowTaskPlan(candidate)).toThrowError(WorkflowTaskPlanError);
  });
});

describe("Workflow / Task Execution runnable selection", () => {
  it("releases only dependency-complete pending tasks within the concurrency bound", () => {
    const admitted = admitWorkflowTaskPlan(plan());

    expect(selectRunnableWorkflowTasks(admitted, states("pending", "pending", "pending"))).toEqual([
      "prepare",
    ]);
    expect(selectRunnableWorkflowTasks(admitted, states("succeeded", "pending", "pending"))).toEqual([
      "publish",
      "observe",
    ]);
    expect(selectRunnableWorkflowTasks(admitted, states("succeeded", "running", "pending"))).toEqual([
      "observe",
    ]);
    expect(selectRunnableWorkflowTasks(admitted, states("succeeded", "running", "running"))).toEqual([]);
  });

  it("does not silently retry failed side effects or bypass failed dependencies", () => {
    const admitted = admitWorkflowTaskPlan(plan());

    expect(selectRunnableWorkflowTasks(admitted, states("succeeded", "failed", "pending"))).toEqual([
      "observe",
    ]);
    expect(selectRunnableWorkflowTasks(admitted, states("failed", "pending", "pending"))).toEqual([]);
  });

  it("rejects causally impossible success behind unsuccessful prerequisites", () => {
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-causal-001",
      planId: "plan-causal-001",
      maxConcurrency: 1,
      tasks: [
        { taskId: "a", dependsOn: [], effect: "pure" },
        { taskId: "b", dependsOn: ["a"], effect: "pure" },
        { taskId: "c", dependsOn: ["b"], effect: "side_effecting" },
      ],
    });
    const vector = (ancestor: "failed" | "pending"): WorkflowTaskStateSnapshot[] => [
      { executionId: "exec-causal-001", planId: "plan-causal-001", taskId: "a", state: ancestor },
      { executionId: "exec-causal-001", planId: "plan-causal-001", taskId: "b", state: "succeeded" },
      { executionId: "exec-causal-001", planId: "plan-causal-001", taskId: "c", state: "pending" },
    ];

    expect(() => selectRunnableWorkflowTasks(admitted, vector("failed"))).toThrowError(
      /successful prerequisite/i,
    );
    expect(() => selectRunnableWorkflowTasks(admitted, vector("pending"))).toThrowError(
      /successful prerequisite/i,
    );
  });

  it("fails closed on incomplete, duplicate, foreign, or non-canonical task state evidence", () => {
    const admitted = admitWorkflowTaskPlan(plan());

    expect(() => selectRunnableWorkflowTasks(admitted, states("pending", "pending", "pending").slice(0, 2))).toThrowError(
      WorkflowTaskPlanError,
    );
    expect(() =>
      selectRunnableWorkflowTasks(admitted, [
        { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "prepare", state: "pending" },
        { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "prepare", state: "pending" },
        { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "observe", state: "pending" },
      ]),
    ).toThrowError(/duplicate task state/i);
    expect(() =>
      selectRunnableWorkflowTasks(admitted, [
        { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "prepare", state: "pending" },
        { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "publish", state: "pending" },
        { executionId: "exec-workflow-001", planId: "plan-workflow-001", taskId: "foreign", state: "pending" },
      ]),
    ).toThrowError(/foreign task state/i);

    const malformed = states("pending", "pending", "pending");
    (malformed[0] as unknown as { state: unknown }).state = { toString: () => "succeeded" };
    expect(() => selectRunnableWorkflowTasks(admitted, malformed)).toThrowError(/task state/i);
  });
});
