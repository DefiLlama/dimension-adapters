import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiFeeCollectors } from "../../helpers/aggregators/lifi";

const FeeCollectedEvent = "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)"

const IntegratorFee = 'Integration & Partnership Fees'
const LifiProtocolFee = 'LiFi Fees'

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const data: any[] = await options.getLogs({
        target: LifiFeeCollectors[options.chain].id,
        topic: '0x28a87b6059180e46de5fb9ab35eb043e8fe00ab45afcc7789e3934ecbbcde3ea',
        eventAbi: FeeCollectedEvent,
    });
    // 0x0000000000000000000000000000000000000000 is the gas token for all chains, we already handle it in the Balances
    data.forEach((log: any) => {
        dailyFees.add(log._token, log._integratorFee, IntegratorFee);
        dailyFees.add(log._token, log._lifiFee, LifiProtocolFee);
        
        dailyRevenue.add(log._token, log._lifiFee, LifiProtocolFee);
        dailySupplySideRevenue.add(log._token, log._integratorFee, IntegratorFee);
    });

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(LifiFeeCollectors).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: LifiFeeCollectors[chain].startTime
            }
        }
    }, {}),

    methodology: {
        Fees: 'All fees paid by users for swap and bridge tokens via LI.FI.',
        Revenue: 'Fees are collected by LI.FI protocol.',
        ProtocolRevenue: 'Fees are collected by LI.FI protocol.',
        SupplySideRevenue: 'Fees are distributed to LI.FI and intergations and partnerships.',
    },
    breakdownMethodology: {
        Fees: {
            [LifiProtocolFee]: 'Fees share for LI.FI protocol.',
            [IntegratorFee]: 'Fees are distributed to LI.FI and intergations and partnerships.',
        },
        Revenue: {
            [LifiProtocolFee]: 'Fees share for LI.FI protocol.',
        },
        ProtocolRevenue: {
            [LifiProtocolFee]: 'Fees share for LI.FI protocol.',
        },
        SupplySideRevenue: {
            [IntegratorFee]: 'Fees are distributed to LI.FI and intergations and partnerships.',
        },
    }
};

export default adapter;