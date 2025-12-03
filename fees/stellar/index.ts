import { Dependencies, FetchOptions, FetchResult, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {

    const dailyFees = options.createBalances();

    const query = `select sum(fee_charged/1e7) as stellar_txn_fee from stellar.history_transactions where closed_at_date=Date('${options.dateString}')`;

    const queryResults = await queryDuneSql(options, query);

    if (!queryResults[0] || !queryResults[0].stellar_txn_fee)
        throw new Error(`Stellar txn fee not found`);

    dailyFees.addCGToken("stellar", queryResults[0].stellar_txn_fee);

    return {
        dailyFees,
        dailyRevenue: dailyFees
    }
}

const methodology = {
    Fees: "Transaction fee paid by users",
    Revenue: "All the fee goes to fee pool"
};

const adapter: SimpleAdapter = {
    fetch,
    start: "2015-09-30",
    methodology,
    chains: [CHAIN.STELLAR],
    protocolType: ProtocolType.CHAIN,
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
};

export default adapter;