export default {
  test: {
    include: ["test/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    passWithNoTests: false,
    watch: false,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      reporter: ["text", "json-summary"],
      thresholds: {
        100: true,
      },
    },
  },
};
