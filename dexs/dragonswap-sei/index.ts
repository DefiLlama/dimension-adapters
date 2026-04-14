import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "DragonSwap protocol swap fee (0.3% per swap).",
  SupplySideRevenue: "Fees distributed to the LP providers (70% of total accumulated fees).",
  ProtocolRevenue: "Fees sent to the protocol wallet (30% of total accumulated fees), is used to provide benefits to users in custom ways."
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: '0.3% fee charged on all token swaps on DragonSwap DEX',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: '30% of swap fees retained by protocol treasury for user benefits and development',
  },
}

const fetch = async (_timestamp: number, _: any, options: FetchOptions): Promise<any> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  const { stats: { v2 } } = await httpGet('https://sei-api.dragonswap.app/api/v1/stats');
  const dateData = v2.daily_data.find((i: any) => i.created_at === options.startOfDay);
  if (!dateData) throw Error(`no data found for date ${new Date(options.startOfDay * 1000).toISOString()}`);
  
  dailyVolume.addUSDValue(dateData.volume_usd, METRIC.SWAP_FEES);
  dailyFees.addUSDValue(dateData.fees_usd, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(Number(dateData.fees_usd) * 0.3, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(Number(dateData.fees_usd) * 0.7, METRIC.SWAP_FEES);
  
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: '2024-05-28',
    },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;

