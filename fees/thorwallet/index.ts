import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
    const data = await httpGet('https://api-v2-prod.thorwallet.org/defillama/fees');
    const { breakdown } = data;

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(parseFloat(breakdown.swapAffiliateFees), 'Swap Affiliate Fees');
    dailyFees.addUSDValue(parseFloat(breakdown.perpCloseFees), 'Perp Close Fees');

    const dailyRevenue = dailyFees.clone(0.95);
    const dailyProtocolRevenue = dailyFees.clone(0.45);
    const dailyHoldersRevenue = dailyFees.clone(0.5);
    const dailySupplySideRevenue = dailyFees.clone(0.05);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: 'All fees from THORChain, Maya, Chainflip swaps and perps trading.',
    UserFees: 'Same as Fees - all fees are paid by users.',
    Revenue: 'Total protocol and holders revenue from all sources.',
    ProtocolRevenue: '45% of fees allocated to protocol treasury.',
    HoldersRevenue: '50% of fees distributed to token holders.',
    SupplySideRevenue: '5% of fees distributed to in game raffle pot players',
};

const breakdownMethodology = {
    Fees: {
        'Swap Affiliate Fees': 'Affiliate fees from swaps across THORChain, Maya, and Chainflip.',
        'Perp Close Fees': 'Fees from closing perpetual trading positions.',
    },
    Revenue: {
        'Swap Affiliate Fees': '95% of Affiliate fees from swaps across THORChain, Maya, and Chainflip.',
        'Perp Close Fees': '95% of Fees from closing perpetual trading positions.',
    },
    ProtocolRevenue: {
        'Swap Affiliate Fees': '45% of Affiliate fees from swaps across THORChain, Maya, and Chainflip.',
        'Perp Close Fees': '45% of Fees from closing perpetual trading positions.',
    },
    HoldersRevenue: {
        'Swap Affiliate Fees': '50% of Affiliate fees from swaps across THORChain, Maya, and Chainflip.',
        'Perp Close Fees': '50% of Fees from closing perpetual trading positions.',
    },
    SupplySideRevenue: {
        'Swap Affiliate Fees': '5% of Affiliate fees from swaps across THORChain, Maya, and Chainflip.',
        'Perp Close Fees': '5% of Fees from closing perpetual trading positions.',
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.THORCHAIN],
    runAtCurrTime: true,
    methodology,
    breakdownMethodology,
};

export default adapter;
