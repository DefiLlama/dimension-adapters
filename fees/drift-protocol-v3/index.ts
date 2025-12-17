import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";

// Drift v3 launched December 4, 2025
// Uses the same program address as v2: dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH

const methodology = {
  Fees: "Trading fees paid by takers on perpetual and spot markets",
  Revenue:
    "Protocol revenue from trading fees minus filler rewards and referral rebates",
  ProtocolRevenue: "Revenue retained by the protocol",
  UserFees: "Fees paid by traders (taker fees)",
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const sql = getSqlFromFile("helpers/queries/drift-protocol.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  const volumeResponse = await queryDuneSql(options, sql);
  const dailyFees = Number(
    Number(volumeResponse[0]?.total_taker_fee || 0).toFixed(0)
  );
  const dailyRevenue = Number(
    Number(volumeResponse[0]?.total_revenue || 0).toFixed(0)
  );

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    timestamp: options.startOfDay,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-12-04",
    },
  },
  methodology,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
