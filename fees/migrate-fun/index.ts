import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { queryAllium } from "../../helpers/allium";

const treasuryAddress = 'h7HnoyxPxBW25UaG6ayo4jSSmFARX9DmpYhbNZsLfiP'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
      SUM(usd_amount) as total_usd_amount
    FROM solana.assets.transfers
    WHERE to_address = '${treasuryAddress}'
      AND from_address != '${treasuryAddress}'
      AND mint IN ('${ADDRESSES.solana.USDC}', '${ADDRESSES.solana.SOL}')
      AND outer_program_id IN ('migK824DsBMp2eZXdhSBAWFS6PbvA6UN8DV15HfmstR')
      AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `;
  const res = await queryAllium(query);
  const dailyFees = res[0]?.total_usd_amount || 0;

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyUserFees: dailyFees }
}

const methodology = {
  Fees: "Platform fees is 3.75% of total liquidity migrated.",
  UserFees: "Platform fees is 3.75% of total liquidity migrated.",
  Revenue: "3.75% of total liquidity migrated.",
  ProtocolRevenue: "3.75% of total liquidity migrated.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2025-09-19',
  chains: [CHAIN.SOLANA],
  methodology
}

export default adapter
