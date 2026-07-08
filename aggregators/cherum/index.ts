import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CherumContracts, BatchLegEvent } from "../../helpers/aggregators/cherum";

// Same-chain fan-out batch swaps routed by CherumRouter. Volume is the input
// notional per successful leg; failed legs are refunded in the same tx and
// are not counted. Cross-chain legs are reported by the Cherum
// bridge-aggregators adapter instead.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: CherumContracts[options.chain].router,
    eventAbi: BatchLegEvent,
  });
  logs.forEach((log: any) => {
    if (!log.success) return;
    dailyVolume.add(log.fromToken, log.amountIn);
  });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.keys(CherumContracts).reduce(
    (acc, chain) => ({
      ...acc,
      [chain]: { fetch, start: CherumContracts[chain].start },
    }),
    {},
  ),
  methodology: {
    Volume: "Input notional of successful same-chain batch-swap legs routed through CherumRouter (BatchLeg events, after fees).",
  },
};

export default adapter;
