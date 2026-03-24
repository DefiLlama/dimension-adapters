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

const quoteMint = "So11111111111111111111111111111111111111112";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
    const query = `SELECT
    SUM(COALESCE(creator_fee, 0)) AS total_creator_fees,
    SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
    SUM(COALESCE(referral_fee, 0)) AS total_referral_fees
  FROM dune.data_watcher.result_bonding_curve_swap_events
  WHERE TIME_RANGE
    AND block_time >= TIMESTAMP '2026-03-04 00:00:00'`

    const dataWatcherData: ICurveFeeData[] = await queryDuneSql(options, query);
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dataWatcherData.forEach((row) => {
        dailyFees.add(quoteMint, Number(row.total_creator_fees), metrics.CreatorFees);
        dailyFees.add(quoteMint, Number(row.total_protocol_fees), metrics.ProtocolFees);
        dailyFees.add(quoteMint, Number(row.total_referral_fees), metrics.ReferralFees);

        dailyProtocolRevenue.add(quoteMint, Number(row.total_protocol_fees), metrics.ProtocolFees);

        dailySupplySideRevenue.add(quoteMint, Number(row.total_creator_fees), metrics.CreatorFees);
        dailySupplySideRevenue.add(quoteMint, Number(row.total_referral_fees), metrics.ReferralFees);
    });

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Total fees paid by users on Trends",
    UserFees: "Total fees paid by users on Trends",
    Revenue: "Protocol fees collected by Trends",
    ProtocolRevenue: "Protocol fees collected by Trends",
    SupplySideRevenue: "Creator fees and referral fees collected by Trends",
}

const breakdownMethodology = {
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
    SupplySideRevenue: {
        [metrics.CreatorFees]: 'Amount of fees paid to creators.',
        [metrics.ReferralFees]: 'Amount of fees paid to referrers.',
    },
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2026-03-04",
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology,
    breakdownMethodology,
};

export default adapter;
