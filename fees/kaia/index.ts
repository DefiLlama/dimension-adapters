import { CHAIN } from "../../helpers/chains";
import { Adapter, ProtocolType, FetchOptions, Dependencies, FetchResult, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const duneQuery = `with raw_tx as(
    select distinct t.hash,t.block_number,t.gas_used,t.gas_price
            from kaia.transactions t where block_time>=from_unixtime(${options.fromTimestamp}) and block_time<from_unixtime(${options.toTimestamp})),
        block_data as(
            select block_number,sum(gas_used * gas_price)/1e18 as block_fee
                from raw_tx group by 1),
        burn_data as(
            select block_number,
                case
                    when block_number < 99841497 then 0
                    when (block_number >= 99841497 and block_number < 119750400) then 0.5
                    when block_number >= 119750400 and block_fee > 1.28 then (block_fee*0.5 + 0.64)/block_fee
                    else 1
                end as burn_rate
            from block_data)
    select
        sum(gas_used * gas_price/1e18) as total_fee,
        sum(gas_used * gas_price/1e18 * b.burn_rate) as burn_fee
    from raw_tx t left join burn_data b on t.block_number = b.block_number`;

    const queryResults = await queryDuneSql(options,duneQuery);

    if(!queryResults || !queryResults[0].total_fee || !queryResults[0].burn_fee)
        throw new Error("Kaia dune query failed");

    dailyFees.addCGToken('kaia',queryResults[0].total_fee);
    dailyRevenue.addCGToken('kaia',queryResults[0].burn_fee);

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue:dailyRevenue
    }
}

const methodology = {
    Fees: "Transaction gas fees paid by users",
    Revenue: "Part of transaction fees burnt",
    HoldersRevenue: "Part of transaction fees burnt"
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.KLAYTN],
    start: '2022-08-29',
    methodology,
    protocolType: ProtocolType.CHAIN,
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true
}

export default adapter;