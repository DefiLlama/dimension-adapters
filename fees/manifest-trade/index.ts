import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const feesEndpoint = "https://mfx-stats-mainnet.fly.dev/fees";

async function fetch(options: FetchOptions) {
  // The stats server indexes fees hourly and requires whole-hour UTC unix
  // timestamps. Daily runs pass day boundaries (already aligned), but the test
  // harness can pass e.g. 23:59:59 as the end, so widen to hour boundaries.
  const HOUR = 3600;
  const startTimestamp = Math.floor(options.startTimestamp / HOUR) * HOUR;
  const endTimestamp = Math.ceil(options.endTimestamp / HOUR) * HOUR;
  const response = await httpGet(
    `${feesEndpoint}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`,
  );

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, response.feesLamports, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Fees: "Trading fees paid by traders, measured as SOL received by the Manifest fee collector account.",
  Revenue: "All fees accrue to the protocol fee collector.",
  ProtocolRevenue: "All revenue goes to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by traders, measured as SOL received by the Manifest fee collector account.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "All trading fees accrue to the protocol fee collector.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "All revenue goes to the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  methodology,
  breakdownMethodology,
  start: '2026-10-28', // first full UTC day of fee indexing; the stats server retains 7 days of hourly data
};

export default adapter;
