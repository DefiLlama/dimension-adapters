import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const feesEndpoint = "https://mfx-stats-mainnet.fly.dev/fees";

async function fetch(options: FetchOptions) {
  // The stats server requires whole-hour UTC unix timestamps.
  const startTimestamp = options.startOfDay;
  const endTimestamp = startTimestamp + 86400;
  const response = await httpGet(
    `${feesEndpoint}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`,
  );

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, response.feesLamports);

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

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  methodology,
  start: '2026-10-28', // first full UTC day of fee indexing; the stats server retains 7 days of hourly data
};

export default adapter;
