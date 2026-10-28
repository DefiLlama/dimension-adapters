import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const PROTOCOL_FEE_SHARE = 0.25;

const methodology = {
  Fees: "DragonSwap V3 charges per-pool swap fees (0.01%, 0.05%, or 0.3% per swap).",
  Revenue: "25% of the swap fees collected by the protocol.",
  ProtocolRevenue: "Protocol's 25% share of swap fees, accrued per pool and collected by the treasury.",
  SupplySideRevenue: "Remaining 75% of swap fees distributed to liquidity providers.",
}

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: 'Per-pool swap fees (0.01%-0.3%) charged on all token swaps' },
  Revenue: { [METRIC.PROTOCOL_FEES]: "Protocol's 25% share of swap fees from all active pools" },
  ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: "Protocol's 25% share of swap fees collected by the treasury" },
  SupplySideRevenue: { [METRIC.LP_FEES]: "75% of swap fees distributed to liquidity providers" },
}

const fetch = async (options: FetchOptions): Promise<any> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { stats: { v3 } } = await httpGet('https://sei-api.dragonswap.app/api/v1/stats');
  const dateData = v3.daily_data.find((i: any) => i.created_at === options.startOfDay);
  if (!dateData) throw Error(`no data found for date ${new Date(options.startOfDay * 1000).toISOString()}`);

  const fees = Number(dateData.fees_usd);
  dailyVolume.addUSDValue(dateData.volume_usd);
  dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(fees * PROTOCOL_FEE_SHARE, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.addUSDValue(fees * PROTOCOL_FEE_SHARE, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(fees * (1 - PROTOCOL_FEE_SHARE), METRIC.LP_FEES);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SEI],
  start: '2024-05-28',
  methodology,
  breakdownMethodology,
}

export default adapter;
