import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {httpGet} from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
    const data = await httpGet('https://api-v2-prod.thorwallet.org/defillama/fees');
    const { breakdown } = data;

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(parseFloat(breakdown.swapAffiliateFees), 'Swap Affiliate Fees');
    dailyFees.addUSDValue(parseFloat(breakdown.perpCloseFees), 'Perp Close Fees');

    const dailyProtocolRevenue = options.createBalances();
    dailyProtocolRevenue.addUSDValue(parseFloat(data.dailyProtocolRevenue), 'Protocol Treasury');

    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.addUSDValue(parseFloat(data.dailyHoldersRevenue), 'Token Holder Distributions');

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    };
};

const methodology = {
    Fees: 'All fees from THORChain, Maya, Chainflip swaps and perps trading.',
    UserFees: 'Same as Fees - all fees are paid by users.',
    Revenue: 'Total protocol revenue from all sources.',
    ProtocolRevenue: '45% of fees allocated to protocol treasury.',
    HoldersRevenue: '50% of fees distributed to token holders.',
};

const breakdownMethodology = {
    Fees: {
        'Swap Affiliate Fees': 'Affiliate fees from swaps across THORChain, Maya, and Chainflip.',
        'Perp Close Fees': 'Fees from closing perpetual trading positions.',
    },
    ProtocolRevenue: {
        'Protocol Treasury': '45% of fees allocated to protocol treasury.',
    },
    HoldersRevenue: {
        'Token Holder Distributions': '50% of fees distributed to token holders.',
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.THORWALLET],
    start: '2024-01-01',
    methodology,
    breakdownMethodology,
};

export default adapter;