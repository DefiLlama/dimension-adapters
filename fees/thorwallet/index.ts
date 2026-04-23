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

    const dailyProtocolRevenue = options.createBalances();
    dailyProtocolRevenue.addUSDValue(parseFloat(data.dailyProtocolRevenue), METRIC.PROTOCOL_FEES);

    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.addUSDValue(parseFloat(data.dailyHoldersRevenue), METRIC.STAKING_REWARDS);

    const dailySupplySideRevenue = options.createBalances();
    dailySupplySideRevenue.addUSDValue(parseFloat(data.dailyRaffleRevenue), 'Raffle Pot Rewards');

    const dailyRevenue = options.createBalances();
    dailyRevenue.addUSDValue(parseFloat(data.dailyProtocolRevenue), METRIC.PROTOCOL_FEES);
    dailyRevenue.addUSDValue(parseFloat(data.dailyHoldersRevenue), METRIC.STAKING_REWARDS);

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
    Fees: 'All affiliate fees from swaps (THORChain, Maya, Near Intents, 1inch, Unizen, Chainflip, Harbor, etc.) plus perpetual trading close fees.',
    UserFees: 'Same as Fees - all fees are paid by users.',
    Revenue: 'Protocol treasury plus $TITN staker revenue.',
    ProtocolRevenue: '45% of THORChain/Maya/Near Intents fees + 100% of 1inch/Unizen/Chainflip/Harbor fees + 100% of perpetual close fees, allocated to protocol treasury.',
    HoldersRevenue: '50% of THORChain/Maya/Near Intents fees distributed to $TITN stakers.',
    SupplySideRevenue: '5% of THORChain/Maya/Near Intents fees distributed to in-game raffle pot players.',
};

const breakdownMethodology = {
    Fees: {
        'Swap Affiliate Fees': 'Affiliate fees from swaps across THORChain, Maya, Near Intents, 1inch, Unizen, Chainflip, Harbor, and other integrated DEXes.',
        'Perp Close Fees': 'Fees from closing perpetual trading positions.',
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: '45% of THORChain/Maya/Near Intents fees + 100% of other swap fees + 100% of perp close fees, allocated to protocol treasury.',
        [METRIC.STAKING_REWARDS]: '50% of THORChain/Maya/Near Intents fees distributed to $TITN stakers.',
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: '45% of THORChain/Maya/Near Intents fees + 100% of other swap fees + 100% of perp close fees, allocated to protocol treasury.',
    },
    HoldersRevenue: {
        [METRIC.STAKING_REWARDS]: '50% of THORChain/Maya/Near Intents fees distributed to $TITN stakers.',
    },
    SupplySideRevenue: {
        'Raffle Pot Rewards': '5% of THORChain/Maya/Near Intents fees distributed to in-game raffle pot players.',
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
