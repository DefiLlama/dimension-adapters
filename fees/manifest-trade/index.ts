import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// Fees are the SOL balance increases of the Manifest fee collector account
// B6dmr2UAn2wgjdm3T4N1Vjd8oPYRRTguByW7AEngkeL6, summed per hour. If the stats
// server is down, the same number can be recomputed directly from chain data
// with the indexer the server runs on:
// https://github.com/Bonasa-Tech/manifest/blob/ff62612100a82a46babb646fc312ab9ceea041db/scripts/stats_utils/feeCollections.ts#L1
const feesEndpoint = "https://mfx-stats-mainnet.fly.dev/fees";

const FEE_LABEL = "Trading and Order Maintenance Fees";

const FEES_DESCRIPTION =
  "Protocol fees swept to the Manifest fee collector, measured as SOL received by the collector account: wrapper trading fees, advanced-order fees, gas deposits reclaimed from expired orders, and rent recovered by market compaction (mostly re-funded by traders placing new orders).";

async function fetch(options: FetchOptions) {
  // The stats server indexes fees hourly and requires whole-hour UTC unix
  // timestamps, while the runner passes second-offset boundaries (endTimestamp
  // minus one second and a 86401s window). Align the end up to the hour and
  // take exactly the trailing 24 hours so consecutive days never overlap.
  const HOUR = 3600;
  const endTimestamp = Math.ceil(options.endTimestamp / HOUR) * HOUR;
  const startTimestamp = endTimestamp - 24 * HOUR;
  const response = await httpGet(
    `${feesEndpoint}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`,
  );

  const dailyFees = options.createBalances();
  dailyFees.add(ADDRESSES.solana.SOL, response.feesLamports, FEE_LABEL);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Fees: FEES_DESCRIPTION,
  Revenue: FEES_DESCRIPTION,
  ProtocolRevenue: FEES_DESCRIPTION,
};

const breakdownMethodology = {
  Fees: {
    [FEE_LABEL]: FEES_DESCRIPTION,
  },
  Revenue: {
    [FEE_LABEL]: "All protocol fees accrue to the fee collector.",
  },
  ProtocolRevenue: {
    [FEE_LABEL]: "All revenue goes to the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // The stats server finalizes each hour of fee data 1-2 hours after the hour
  // closes, so pulling the most recent hour would consistently fail. Pull
  // daily instead; completed days are always fully indexed by run time.
  pullHourly: false,
  fetch,
  chains: [CHAIN.SOLANA],
  methodology,
  breakdownMethodology,
  start: '2026-10-28', // first full UTC day of fee indexing; the stats server retains 7 days of hourly data
};

export default adapter;
