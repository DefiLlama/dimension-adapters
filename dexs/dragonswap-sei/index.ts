import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const PROTOCOL_FEE_SHARE = 0.3;

const methodology = {
  Fees: "DragonSwap protocol swap fee (0.3% per swap).",
  Revenue: "The protocol's 30% cut of swap fees collected by the treasury.",
  ProtocolRevenue: "The protocol's 30% cut of swap fees collected by the treasury.",
  SupplySideRevenue: "Fees distributed to the LP providers (70% of total accumulated fees).",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: '0.3% fee charged on all token swaps on DragonSwap DEX',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "30% of swap fees accrued to the protocol",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "30% of swap fees collected by the protocol treasury",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: '70% of swap fees distributed to liquidity providers',
  },
}

const fetch = async (options: FetchOptions): Promise<any> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { stats: { v2 } } = await httpGet('https://sei-api.dragonswap.app/api/v1/stats');
  const dateData = v2.daily_data.find((i: any) => i.created_at === options.startOfDay);
  if (!dateData) throw Error(`no data found for date ${new Date(options.startOfDay * 1000).toISOString()}`);

  const fees = Number(dateData.fees_usd);
  dailyVolume.addUSDValue(dateData.volume_usd);
  dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(fees * PROTOCOL_FEE_SHARE, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.addUSDValue(fees * PROTOCOL_FEE_SHARE, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(fees * (1 - PROTOCOL_FEE_SHARE), METRIC.LP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SEI],
  start: '2024-05-28',
  methodology,
  breakdownMethodology,
}

export default adapter;
