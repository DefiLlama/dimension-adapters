import { CHAIN } from "../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";

const chains = [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.OPTIMISM, CHAIN.ERA, CHAIN.POLYGON, CHAIN.BASE, CHAIN.BSC, CHAIN.LINEA, CHAIN.SCROLL, CHAIN.AVAX, CHAIN.FANTOM,
    // disabled chains: CHAIN.MANTLE, CHAIN.BLAST, CHAIN.CRONOS, CHAIN.POLYGON_ZKEVM,
]

const blacklistedTokens = [
    // UXLINK is hacked
    '0x1a6b3a62391eccaaa992ade44cd4afe6bec8cff1',
    
    // SFUND is hacked
    '0x477bc8d23c634c154061869478bce96be6045d12',
    '0x560363bda52bc6a44ca6c8c9b4a5fadbda32fa60',
    '0xb02f37a282c028958de65711158422199a61e9ae',
    '0x633e254585ade6e9d40d2a4b8cc2f3769b94cb48',

    // MAGA
    '0xda2e903b0b67f30bf26bd3464f9ee1a383bbbe5f',
]
const feeCollector = "0x4f82e73edb06d29ff62c91ec8f5ff06571bdeb29"
async function fetch(options: FetchOptions) {
    // MISSING INTERNAL ETH TRANSFERS!
    const dailyFees = await addTokensReceived({ target: feeCollector, options })
    blacklistedTokens.forEach(t => dailyFees.removeTokenBalance(t))
/*     const { usdTokenBalances, usdTvl, rawTokenBalances, } = await dailyFees.getUSDJSONs()
    console.log({ chain: options.chain, usdTvl })
    const tokens = Object.keys(rawTokenBalances).map(t => t.split(':')[1])
    const symbols = await options.api.multiCall({  abi: 'string:symbol', calls: tokens, permitFailure: true })
    console.table(symbols.map((s, i) => ({ token: tokens[i], symbol: s })))

    let debugTable: any = []
    Object.entries(usdTokenBalances).filter(([, v]) => v > 1000).forEach(([t, v]) => {
        debugTable.push({ token: t, value: v })
    })
    console.table(debugTable) */
    return { dailyFees, dailyRevenue: dailyFees }
}

export default {
    start: '2023-05-12',
    fetch,
    chains,
    version: 2
} as SimpleAdapter;
