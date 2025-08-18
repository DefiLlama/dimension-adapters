import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from '../../helpers/token';

const APE_STORE_FEE_VAULT = '0xd52b1994e745c0ee5bc7ad41414da7d9e0815b66';

const fetchFees = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    await getETHReceived({ options, balances: dailyFees, targets: [APE_STORE_FEE_VAULT] })
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: Adapter = {
    version: 2,
    isExpensiveAdapter: true,
    adapter: {
        [CHAIN.BASE]: {
            fetch: fetchFees,
        },
    },
    methodology: {
        Fees: 'Total fees paid by users for creating and trading tokens.',
        Revenue: 'Total fees paid by users for creating and trading tokens.',
        ProtocolRevenue: 'Total fees paid by users for creating and trading tokens.',
    }
}

export default adapter;
