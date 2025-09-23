import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_t: any, _a: any, options: FetchOptions) => {
    const query = `select (
        select sum(coalesce(json_value(args, 'lax $.BurnDelegatedDataCreditsArgsV0.amount' returning bigint), 0)) / 1e5
        from helium_solana.data_credits_call_burnDelegatedDataCreditsV0 where call_block_time >=  from_unixtime(${options.fromTimestamp}) and call_block_time < from_unixtime(${options.toTimestamp}))
    + (
        select sum(coalesce(json_value(args, 'lax $.BurnWithoutTrackingArgsV0.amount' returning bigint), 0)) / 1e5
        from helium_solana.data_credits_call_burnWithoutTrackingV0 where call_block_time >=  from_unixtime(${options.fromTimestamp}) and call_block_time <  from_unixtime(${options.toTimestamp})
    ) as fees`;
    const queryResults = await queryDuneSql(options, query);
    const feesInUsd = queryResults.length > 0 ? queryResults[0].fees : 0;
    const dailyFees = feesInUsd;

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: '0',
        dailyHoldersRevenue: dailyFees,
    };
}

const methodology = {
    Fees: 'All fees paid(in Data credits) to use helium network services.',
    Revenue: 'Data credits are minted by burning HNT',
    ProtocolRevenue: 'Protocol revenue is 0',
    HoldersRevenue: 'Data credits are minted by burning HNT',
};

const adapters: SimpleAdapter = {
    fetch,
    methodology,
    chains: [CHAIN.SOLANA],
    start: '2023-04-18',
    isExpensiveAdapter: true
};

export default adapters;