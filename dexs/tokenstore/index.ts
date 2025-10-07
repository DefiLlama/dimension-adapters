import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const tokenStore = "0x1cE7AE555139c5EF5A57CC8d814a867ee6Ee33D8"

export const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances()

    const trades = await options.api.getLogs({
        target: tokenStore,
        eventAbi: 'event Trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address get, address give, uint nonce)',
        fromBlock: await options.getFromBlock(),
        toBlock: await options.getToBlock(),
    })
    if (trades.length === 0) return { dailyVolume }

    trades.forEach((trade: any) => {
        dailyVolume.add(trade.args.tokenGet, BigInt(trade.args.amountGet))
        dailyVolume.add(trade.args.tokenGive, BigInt(trade.args.amountGive))
    })

    return { dailyVolume }
}

const adapter: SimpleAdapter = {
    methodology: {
        Volume: "Trading volume across all pairs on TokenStore.",
    },
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
        },
    },
}

export default adapter
