import { runDeterministicTradeDataCoverageBurstBenchmark } from "./trade-data-coverage-replay-service";

const result = runDeterministicTradeDataCoverageBurstBenchmark();
console.log(JSON.stringify(result, null, 2));
if (result.status !== "BURST_BENCHMARK_PASSED") {
  process.exitCode = 1;
}
