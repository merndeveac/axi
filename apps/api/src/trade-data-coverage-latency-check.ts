import { runProductionTradeDataLatencyCheck } from "./trade-data-coverage-latency-service";

const result = await runProductionTradeDataLatencyCheck();
console.log(JSON.stringify(result, null, 2));

if (result.status !== "PRODUCTION_LATENCY_CHECK_PASSED") {
  process.exitCode = 1;
}
