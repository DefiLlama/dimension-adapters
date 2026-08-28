import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const PROTOCOL_LABEL = 'Affiliate & Perp Close Fees To Treasury';
const STAKERS_LABEL = 'Affiliate Fees To $TITN Stakers';
const RAFFLE_LABEL = 'Raffle Pot Rewards To Players';

const fetch = async (options: FetchOptions) => {
    const data = await httpGet('https://api-v2-prod.thorwallet.org/defillama/fees');
    const { breakdown } = data;

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(parseFloat(breakdown.swapAffiliateFees), 'Swap Affiliate Fees');
    dailyFees.addUSDValue(parseFloat(breakdown.perpCloseFees), 'Perp Close Fees');

    const dailyProtocolRevenue = options.createBalances();
    dailyProtocolRevenue.addUSDValue(parseFloat(data.dailyProtocolRevenue), PROTOCOL_LABEL);

    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.addUSDValue(parseFloat(data.dailyHoldersRevenue), STAKERS_LABEL);
    dailyHoldersRevenue.addUSDValue(parseFloat(data.dailyRaffleRevenue ?? '0'), RAFFLE_LABEL);

    const dailyRevenue = options.createBalances();
    dailyRevenue.addUSDValue(parseFloat(data.dailyProtocolRevenue), PROTOCOL_LABEL);
    dailyRevenue.addUSDValue(parseFloat(data.dailyHoldersRevenue), STAKERS_LABEL);
    dailyRevenue.addUSDValue(parseFloat(data.dailyRaffleRevenue ?? '0'), RAFFLE_LABEL);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    };
};

const methodology = {
    Fees: 'All affiliate fees from swaps (THORChain, Maya, Near Intents, 1inch, Unizen, Chainflip, Harbor, etc.) plus perpetual trading close fees.',
    UserFees: 'Same as Fees - all fees are paid by users.',
    Revenue: 'Protocol treasury plus distributions to $TITN stakers and raffle pot players.',
    ProtocolRevenue: '45% of THORChain/Maya/Near Intents fees + 100% of 1inch/Unizen/Chainflip/Harbor fees + 100% of perpetual close fees, allocated to protocol treasury.',
    HoldersRevenue: '50% of THORChain/Maya/Near Intents fees distributed to $TITN stakers plus 5% distributed to in-game raffle pot players.',
};

const breakdownMethodology = {
    Fees: {
        'Swap Affiliate Fees': 'Affiliate fees from swaps across THORChain, Maya, Near Intents, 1inch, Unizen, Chainflip, Harbor, and other integrated DEXes.',
        'Perp Close Fees': 'Fees from closing perpetual trading positions.',
    },
    Revenue: {
        [PROTOCOL_LABEL]: '45% of THORChain/Maya/Near Intents fees + 100% of other swap fees + 100% of perp close fees, allocated to protocol treasury.',
        [STAKERS_LABEL]: '50% of THORChain/Maya/Near Intents fees distributed to $TITN stakers.',
        [RAFFLE_LABEL]: '5% of THORChain/Maya/Near Intents fees distributed to in-game raffle pot players.',
    },
    ProtocolRevenue: {
        [PROTOCOL_LABEL]: '45% of THORChain/Maya/Near Intents fees + 100% of other swap fees + 100% of perp close fees, allocated to protocol treasury.',
    },
    HoldersRevenue: {
        [STAKERS_LABEL]: '50% of THORChain/Maya/Near Intents fees distributed to $TITN stakers.',
        [RAFFLE_LABEL]: '5% of THORChain/Maya/Near Intents fees distributed to in-game raffle pot players.',
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
