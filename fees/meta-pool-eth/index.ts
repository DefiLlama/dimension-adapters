import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"
import { getERC4626VaultsYield } from "../../helpers/erc4626"
import ADDRESSES from "../../helpers/coreAssets.json";

const vaults = [
    '0x48afbbd342f64ef8a9ab1c143719b63c2ad81710', // old
    '0xd06f6a56c5f599cb375b616df306f32b7f6f4a0e', // new
];

// https://docs.metapool.app/master/faq-frequently-asked-questions/faq-by-chain/ethereum#does-meta-pool-charge-for-the-service
const PROTOCOL_FEE = 0.1; // 10%

// https://docs.metapool.app/master/faq-frequently-asked-questions/faq-by-chain/ethereum#deposite-fee
const DEPOSIT_FEE = 0.01; // 1%

const fetch = async (options: FetchOptions) => {
    const dailyYield = await getERC4626VaultsYield({options, vaults })

    const dailyFees = dailyYield.clone(1 / (1 - PROTOCOL_FEE), METRIC.STAKING_REWARDS);
    const dailyRevenue = dailyFees.clone(PROTOCOL_FEE, METRIC.STAKING_REWARDS);
    const dailySupplySideRevenue = dailyFees.clone(1, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.subtract(dailyRevenue, METRIC.STAKING_REWARDS);

    const dailyUserFees = options.createBalances()

    const depositEvents = await options.getLogs({
        target: '0xD06f6a56c5f599cB375B616DF306f32B7F6f4A0E',
        eventAbi: 'event Deposit (address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
    })
    for (const event of depositEvents) {
        dailyFees.add(ADDRESSES.ethereum.WETH, Number(event.assets) * DEPOSIT_FEE, METRIC.DEPOSIT_WITHDRAW_FEES)
        dailyRevenue.add(ADDRESSES.ethereum.WETH, Number(event.assets) * DEPOSIT_FEE, METRIC.DEPOSIT_WITHDRAW_FEES)
    }

    return { dailyFees, dailyRevenue, dailyUserFees, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: '2023-07-14',
        },
    },
    methodology: {
        Fees: 'Total ETH staking rewards.',
        UserFees: 'Users pay 1% fee on every deposit.',
        Revenue: 'Share of 10% from ETH staking rewards + 1% deposit fee.',
        ProtocolRevenue: 'Share of 10% from ETH staking rewards + 1% deposit fee.',
        SupplySideRevenue: 'Share of 90% from ETH staking rewards.',
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.STAKING_REWARDS]: 'ETH staking rewards',
            [METRIC.DEPOSIT_WITHDRAW_FEES]: '1% fees charged on every deposit.',
        },
        UserFees: {
            [METRIC.DEPOSIT_WITHDRAW_FEES]: '1% fees charged on every deposit.',
        },
        Revenue: {
            [METRIC.STAKING_REWARDS]: 'Share of 10% ETH staking rewards',
            [METRIC.DEPOSIT_WITHDRAW_FEES]: '1% fees charged on every deposit.',
        },
        ProtocolRevenue: {
            [METRIC.STAKING_REWARDS]: 'Share of 10% ETH staking rewards',
            [METRIC.DEPOSIT_WITHDRAW_FEES]: '1% fees charged on every deposit.',
        },
        SupplySideRevenue: {
            [METRIC.STAKING_REWARDS]: 'Share of 90% ETH staking rewards',
        },
    }
}

export default adapter
