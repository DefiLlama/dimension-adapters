import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {httpGet} from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
    const data = await httpGet('https://api-v2-prod.thorwallet.org/defillama/fees');

    const dailyFees = options.createBalances();

    dailyFees.addUSDValue(parseFloat(data.dailyFees));

    const dailyProtocolRevenue = options.createBalances();
    dailyProtocolRevenue.addUSDValue(parseFloat(data.dailyProtocolRevenue));

    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.addUSDValue(parseFloat(data.dailyHoldersRevenue));

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

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.THORWALLET], // Or whichever chain represents your protocol
    start: '2024-01-01', // When your protocol started
    methodology,
};

export default adapter;