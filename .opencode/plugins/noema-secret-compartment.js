/**
 * Keeps the NVIDIA NIM provider credential inside the trusted OpenCode process.
 *
 * OpenCode's bash tool executes model-selected child processes. The hourly
 * product-development agent needs the NVIDIA provider credential in its own
 * process to call the model, so model-selected shell execution is denied at
 * the plugin boundary. Deterministic source and test execution remains the
 * responsibility of the separate uncredentialed verifier job.
 */
export const NoemaSecretCompartment = async () => ({
  "tool.execute.before": async (input) => {
    if (input.tool === "bash") {
      throw new Error(
        "NVIDIA NIM credential compartment: model shell execution is disabled; write the proposal and let the separate uncredentialed verifier execute tests.",
      );
    }
  },
});
