import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from '../../helpers/token';

const APE_STORE_FEE_VAULT = '0xd52b1994e745c0ee5bc7ad41414da7d9e0815b66';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const tempBalance = options.createBalances();
    await getETHReceived({ options, balances: tempBalance, targets: [APE_STORE_FEE_VAULT] })
    dailyFees.addBalances(tempBalance, 'Token launchpad fees');
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const breakdownMethodology = {
    Fees: {
        'Token launchpad fees': 'Fees paid by users for creating and trading tokens on the ApeStore platform',
    },
    Revenue: {
        'Token launchpad fees': 'Fees paid by users for creating and trading tokens, all retained by the protocol',
    },
    ProtocolRevenue: {
        'Token launchpad fees': 'All fees from token creation and trading go to the protocol treasury',
    }
};

const adapter: Adapter = {
    version: 2,
    isExpensiveAdapter: true,
    fetch,
    chains: [CHAIN.BASE],
    dependencies: [Dependencies.ALLIUM],
    methodology: {
        Fees: 'Total fees paid by users for creating and trading tokens.',
        Revenue: 'Total fees paid by users for creating and trading tokens.',
        ProtocolRevenue: 'Total fees paid by users for creating and trading tokens.',
    },
    breakdownMethodology,
}

export default adapter;