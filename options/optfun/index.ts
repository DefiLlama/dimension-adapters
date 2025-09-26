import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OPTFUN_CONTRACT = "0x7dB5B94c875d12bB77062d368d36D43EAbB6A961"
const CYCLE_SETTLED_ABI = "event CycleSettled(uint256 indexed cycleId, uint256 notionalVolume)"

export async function fetch(options: FetchOptions): Promise<FetchResult> {
  const logs = await options.getLogs({
    target: OPTFUN_CONTRACT,
    eventAbi: CYCLE_SETTLED_ABI,
  });

  let dailyNotional = 0;

  for (const log of logs) {
    const notionalVolume = Number(log.notionalVolume);
    dailyNotional += notionalVolume;
  }

  const dailyNotionalVolume = options.createBalances();
  dailyNotionalVolume.addCGToken('tether', dailyNotional / 1e6);

  return {
    dailyNotionalVolume,
  };
}

const adapter: SimpleAdapter = {
  methodology: {
    NotionalVolume: "Notional volume summed from CycleSettled events in USDC.",
  },
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-06-17',
    },
  },
}

export default adapter;
