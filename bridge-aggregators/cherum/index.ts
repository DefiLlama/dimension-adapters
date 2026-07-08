import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CherumContracts, BatchOpenedEvent } from "../../helpers/aggregators/cherum";

// Cross-chain fan-out batches opened on the source chain by
// CherumFanOutRouter. Bridge volume is the principal actually dispatched
// into bridges (input token, after fees), counted once on the source chain;
// destination-side delivery is not counted again.
const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: CherumContracts[options.chain].fanout,
    eventAbi: BatchOpenedEvent,
  });
  logs.forEach((log: any) => {
    dailyBridgeVolume.add(log.tokenIn, log.principal);
  });
  return { dailyBridgeVolume };
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
    BridgeVolume: "Principal dispatched into bridges by cross-chain fan-out batches on the source chain (BatchOpened events, input token, after fees).",
  },
};

export default adapter;
