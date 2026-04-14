import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const fetch = async (options: FetchOptions) => {
    const data = await httpGet('https://api-v2-prod.thorwallet.org/defillama/fees');
    const { breakdown } = data;

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(parseFloat(breakdown.swapAffiliateFees), 'Swap Affiliate Fees');
    dailyFees.addUSDValue(parseFloat(breakdown.perpCloseFees), 'Perp Close Fees');

    const dailyRevenue = dailyFees.clone(0.45, METRIC.PROTOCOL_FEES);
    dailyRevenue.add(dailyFees.clone(0.5, METRIC.STAKING_REWARDS), METRIC.STAKING_REWARDS);
    const dailyProtocolRevenue = dailyFees.clone(0.45, METRIC.PROTOCOL_FEES);
    const dailyHoldersRevenue = dailyFees.clone(0.5, METRIC.STAKING_REWARDS);
    const dailySupplySideRevenue = dailyFees.clone(0.05, 'Raffle Pot Rewards');

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
        [METRIC.PROTOCOL_FEES]: '45% of fees allocated to protocol treasury.',
        [METRIC.STAKING_REWARDS]: '50% of fees distributed to $TITN stakers.',
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: '45% of fees allocated to protocol treasury.',
    },
    HoldersRevenue: {
        [METRIC.STAKING_REWARDS]: '50% of fees distributed to $TITN stakers.',
    },
    SupplySideRevenue: {
        'Raffle Pot Rewards': '5% of fees distributed to in game raffle pot players',
    }
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
