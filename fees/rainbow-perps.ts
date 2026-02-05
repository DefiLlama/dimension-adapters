import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { fetchBuilderCodeRevenue } from '../helpers/hyperliquid'

const RAINBOW_BUILDER_ADDRESS = '0x60dc8e3dad2e4e0738e813b9cb09b9c00b5e0fc9'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: RAINBOW_BUILDER_ADDRESS });

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
    }
}

const methodology = {
    Fees: 'builder code revenue from Hyperliquid Perps Trades.',
    Revenue: 'builder code revenue from Hyperliquid Perps Trades.',
    ProtocolRevenue: 'builder code revenue from Hyperliquid Perps Trades.',
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: '2025-09-15',
    methodology,
    doublecounted: true,
}

export default adapter;
