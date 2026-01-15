import { FetchOptions, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const WHALES_DUNE_QUERY_ID = "6532559";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  try {
    const query = `
      WITH token_transfers AS (
        SELECT 
          TRY_CAST(value AS DOUBLE) / 1e6 as amount_usd,
          "to" as recipient,
          "from" as sender
        FROM erc20_ethereum.evt_Transfer
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
          AND evt_block_time < from_unixtime(${options.endTimestamp})
          AND contract_address IN (
            0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48,
            0xdac17f958d2ee523a2206206994597c13d831ec7
          )
          AND (
            "to" = 0x1ecdb32e59e948c010a189a0798c674a2d0c6603
            OR "from" = 0x1ecdb32e59e948c010a189a0798c674a2d0c6603
          )
      )
      SELECT 
        SUM(amount_usd) * 0.015 as estimated_fees_usd
      FROM token_transfers
    `;

    const results = await queryDune(WHALES_DUNE_QUERY_ID, { fullQuery: query }, options);

    if (results && results.length > 0) {
      const fees = Number(results[0].estimated_fees_usd) || 0;
      if (fees > 0) {
        dailyFees.addCGToken('tether', fees);
        dailyRevenue.addCGToken('tether', fees);
      }
    }
  } catch (error: any) {
    console.error("Error fetching Whales data:", error.message);
    throw error;
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(0.6),
    dailyProtocolRevenue: dailyRevenue.clone(0.4),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1704067200,
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  meta: {
    methodology: {
      Fees: "Fees estimated from USDC/USDT trading volume through Whales Market contract at 1.5% rate.",
      Revenue: "100% of fees distributed: 60% to stakers, 20% dev, 10% buyback, 10% LOOT.",
    },
  },
};

export default adapter;