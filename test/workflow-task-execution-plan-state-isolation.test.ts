import { describe, expect, it } from "vitest";

import {
  WorkflowTaskPlanError,
  selectRunnableWorkflowTasks,
  type WorkflowTaskPlan,
  type WorkflowTaskStateSnapshot,
} from "../src/workflow-task-execution/task-plan";

describe("Workflow / Task Execution plan-state isolation", () => {
  it("rejects an unadmitted plan before its accessors can mutate retained state evidence", () => {
    const currentStates: WorkflowTaskStateSnapshot[] = [
      {
        executionId: "exec-plan-state-isolation",
        planId: "plan-plan-state-isolation",
        taskId: "prepare",
        state: "failed",
      },
      {
        executionId: "exec-plan-state-isolation",
        planId: "plan-plan-state-isolation",
        taskId: "publish",
        state: "pending",
      },
    ];
    let planAccessorReads = 0;
    const hostilePlan = Object.defineProperties({}, {
      executionId: {
        enumerable: true,
        get: () => {
          planAccessorReads += 1;
          currentStates[0] = { ...currentStates[0], state: "succeeded" };
          return "exec-plan-state-isolation";
        },
      },
      planId: { enumerable: true, value: "plan-plan-state-isolation" },
      maxConcurrency: { enumerable: true, value: 1 },
      tasks: {
        enumerable: true,
        value: [
          { taskId: "prepare", dependsOn: [], effect: "pure" },
          { taskId: "publish", dependsOn: ["prepare"], effect: "side_effecting" },
        ],
      },
    }) as WorkflowTaskPlan;

    expect(() => selectRunnableWorkflowTasks(hostilePlan, currentStates)).toThrowError(
      WorkflowTaskPlanError,
    );
    expect(planAccessorReads).toBe(0);
    expect(currentStates[0].state).toBe("failed");
  });
});
