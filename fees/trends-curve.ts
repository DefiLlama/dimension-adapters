import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

interface ICurveFeeData {
  total_creator_fees: number;
  total_protocol_fees: number;
  total_referral_fees: number;
}

const metrics = {
  CreatorFees: METRIC.CREATOR_FEES,
  ProtocolFees: METRIC.PROTOCOL_FEES,
  ReferralFees: "Referral Fees",
}

const curveFeeSQL = `
  SELECT
    SUM(COALESCE(creator_fee, 0)) AS total_creator_fees,
    SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
    SUM(COALESCE(referral_fee, 0)) AS total_referral_fees
  FROM dune.data_watcher.result_bonding_curve_swap_events
  WHERE block_time >= from_unixtime({{start}})
    AND block_time < from_unixtime({{end}})
    AND block_time >= TIMESTAMP '2026-03-04 00:00:00'
`;

const getSqlFromString = (
  sql: string,
  variables: Record<string, any> = {}
): string => {
  Object.entries(variables).forEach(([key, value]) => {
    sql = sql.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  });
  return sql;
};

const quoteMint = "So11111111111111111111111111111111111111112";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const curveFeeQuery = getSqlFromString(curveFeeSQL, {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  const dataWatcherData: ICurveFeeData[] = await queryDuneSql(options, curveFeeQuery);
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dataWatcherData.forEach((row) => {
    dailyFees.add(quoteMint, Number(row.total_creator_fees), metrics.CreatorFees);
    dailyFees.add(quoteMint, Number(row.total_protocol_fees), metrics.ProtocolFees);
    dailyFees.add(quoteMint, Number(row.total_referral_fees), metrics.ReferralFees);

    dailyProtocolRevenue.add(quoteMint, Number(row.total_protocol_fees), metrics.ProtocolFees);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-03-04",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total fees paid by users on Trends",
    UserFees: "Total fees paid by users on Trends",
    Revenue: "All fees collected by Trends.",
    ProtocolRevenue: "All fees collected by Trends.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.CreatorFees]: 'Amount of fees paid to creators.',
      [metrics.ProtocolFees]: 'Amount of fees paid to Trends protocol.',
      [metrics.ReferralFees]: 'Amount of fees paid to referrers.',
    },
    UserFees: {
      [metrics.CreatorFees]: 'Amount of fees paid to creators.',
      [metrics.ProtocolFees]: 'Amount of fees paid to Trends protocol.',
      [metrics.ReferralFees]: 'Amount of fees paid to referrers.',
    },
    Revenue: {
      [metrics.ProtocolFees]: 'Amount of fees paid to Trends protocol.',
    },
    ProtocolRevenue: {
      [metrics.ProtocolFees]: 'Amount of fees paid to Trends protocol.',
    },
  }
};

export default adapter;
