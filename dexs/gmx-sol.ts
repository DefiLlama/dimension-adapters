import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql";

// Minimum fee rate threshold to filter wash trading
// Normal trading: ~0.010-0.012% fee rate
// Wash trading days show ~0.005-0.008% (traders open/close instantly,
// earning back ~75% of fees via LP deposits, making farming very cheap)
const MIN_FEE_RATE = 0.00008; // 0.008%

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const targetDate = new Date(options.startOfDay * 1000).toISOString();

  const query = gql`
    {
      volumeRecordDailies(
        where: {timestamp_eq: "${targetDate}"}
      ) {
        timestamp
        tradeVolume
      }
      feesRecordDailies(
        where: {timestamp_eq: "${targetDate}"}
      ) {
        timestamp
        totalFees
      }
    }
  `;

  const res = await request(url, query);

  const volumeRecord = res.volumeRecordDailies[0];
  const feesRecord = res.feesRecordDailies[0];

  if (!volumeRecord) throw new Error('Not found daily volume data!');
  if (!feesRecord) throw new Error('Not found daily fees data!');

  const rawVolume = Number(volumeRecord.tradeVolume) / (10 ** 20);
  const rawFees = Number(feesRecord.totalFees) / (10 ** 20);

  if (rawVolume === 0) throw new Error('Not found daily data!');

  // Calculate fee rate to detect wash trading
  const feeRate = rawFees / rawVolume;

  // If fee rate is abnormally low, cap volume to what legitimate
  // trading at the minimum fee rate would produce
  const dailyVolume = feeRate < MIN_FEE_RATE
    ? rawFees / MIN_FEE_RATE
    : rawVolume;

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  version: 1,
  chains: [CHAIN.SOLANA],
  start: '2025-02-12',
};

export default adapter;
