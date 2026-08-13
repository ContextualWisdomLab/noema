const ALERT_KEYS = [
  "NOEMA_ALERT_5M_FAILURE_RATE",
  "NOEMA_ALERT_5M_P95_MS",
  "NOEMA_ALERT_RATE_LIMIT_MINUTES",
  "NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER",
];

/**
 * Build the complete environment for one KPI child process from an explicit
 * allowlist. Ambient parent state is never copied wholesale: the strict KPI
 * checker receives only its requested window, while the alert evaluator may
 * receive only the four reviewed alert-threshold inputs above.
 *
 * @param {string} stepName Closed child-step identity.
 * @param {Record<string, unknown>} parentEnvironment Ambient parent values.
 * @param {Record<string, unknown>} stepEnvironment Explicit per-step values.
 * @returns {Record<string, string>} Least-authority child environment.
 * @throws {Error} When the child-step identity is not part of the closed contract.
 */
export function createKpiChildEnvironment(stepName, parentEnvironment = {}, stepEnvironment = {}) {
  if (stepName === "kpi-check") {
    const value = stepEnvironment.NOEMA_KPI_REQUIRE_WINDOW_DAYS;
    return typeof value === "string" ? { NOEMA_KPI_REQUIRE_WINDOW_DAYS: value } : {};
  }

  if (stepName === "kpi-alert") {
    const environment = {};
    for (const key of ALERT_KEYS) {
      const value = parentEnvironment[key];
      if (typeof value === "string") environment[key] = value;
    }
    return environment;
  }

  throw new Error(`Unknown KPI child step: ${stepName}`);
}
