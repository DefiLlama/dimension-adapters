import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// const feeAdapter = chainAdapter(CHAIN.LITECOIN, "ltc", 1317960000);

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const dailyFees = options.createBalances()
  const data = await httpGet('https://litecoinspace.org/api/v1/mining/blocks/fees/24h')
  for (const item of data) {
    dailyFees.addCGToken('litecoin', Number(item.avgFees) / 1e8)
  }
  return { dailyFees }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.LITECOIN]: {
      fetch,
      runAtCurrTime: true,
    }
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
