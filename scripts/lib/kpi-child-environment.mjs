const ALERT_KEYS = [
  "NOEMA_ALERT_5M_FAILURE_RATE",
  "NOEMA_ALERT_5M_P95_MS",
  "NOEMA_ALERT_RATE_LIMIT_MINUTES",
  "NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER",
];

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
