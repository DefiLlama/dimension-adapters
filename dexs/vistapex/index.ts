import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const STATS_URL = "https://api.perps.vistapex.io/v1/stats/volume";
const USDC_DECIMALS = 1e6;

interface StatsResponse {
  volume: string;
  fees: string;
  trade_count: number;
  active_traders: number;
  cumulative_traders: number;
}

const fetch = async (options: FetchOptions) => {
  const fromMs = options.startTimestamp * 1000;
  const toMs = options.endTimestamp * 1000;
  const stats: StatsResponse = await fetchURLAutoHandleRateLimit(`${STATS_URL}?from_ms=${fromMs}&to_ms=${toMs}`);

  if (stats.volume == null || stats.fees == null)
    throw new Error(`Invalid Vistapex stats response: ${JSON.stringify(stats)}`);
  const volume = Number(stats.volume) / USDC_DECIMALS;
  const fees = Number(stats.fees) / USDC_DECIMALS;
  if (!Number.isFinite(volume) || !Number.isFinite(fees))
    throw new Error(`Invalid Vistapex stats response: ${JSON.stringify(stats)}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addUSDValue(fees, "Perpetual Trading Fees");
  dailyRevenue.addUSDValue(fees, "Perpetual Trading Fees To Protocol");

  return {
    dailyVolume: volume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Traded notional of perpetual fills on the Vistapex order book. Each fill is counted once (not per side), and self-trades are excluded. Liquidations closed on the order book are included; ADL and backstop takeovers are not.",
  Fees: "Maker plus taker trading fees paid by traders, net of maker rebates.",
  UserFees: "All trading fees are paid directly by traders.",
  Revenue: "All net trading fees are kept by the protocol.",
  ProtocolRevenue: "All net trading fees are kept by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    "Perpetual Trading Fees": "Maker plus taker trading fees on perpetual fills, net of maker rebates.",
  },
  Revenue: {
    "Perpetual Trading Fees To Protocol": "Net trading fees retained by the Vistapex Perps protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.AVAX],
  fetch,
  start: "2026-10-20",
  methodology,
  breakdownMethodology,
};

export default adapter;
