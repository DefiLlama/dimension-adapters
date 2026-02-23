import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { addTokensReceived } from "../../helpers/token"
import ADDRESSES from "../../helpers/coreAssets.json"

const FEE_WALLET = '0x0B8f593C41C4CeeF6A2490861F7636C5CD19C078'

const TOKENS: Record<string, string> = {
    [CHAIN.BASE]: ADDRESSES.base.USDC,
    [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.USDC_CIRCLE,
    [CHAIN.PLASMA]: ADDRESSES.plasma.USDT0,
    [CHAIN.HYPERLIQUID]: ADDRESSES.hyperliquid.USDT0,
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    await addTokensReceived({
        options,
        target: FEE_WALLET,
        tokens: [TOKENS[options.chain]],
        balances: dailyFees,
    })

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.PLASMA, CHAIN.HYPERLIQUID],
    start: "2025-04-14",
    methodology: {
        Fees: "A linearly decaying fee starting at 5% is charged on withdrawals made within 30 days of deposit.",
        Revenue: "All early withdrawal fees are collected by the protocol."
    },
}

export default adapter
