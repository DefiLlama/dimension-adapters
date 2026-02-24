import { CHAIN } from "../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";

const chainConfig: Record<string, { id: number, start: string }> = {
  [CHAIN.ETHEREUM]: { id: 1, start: '2021-06-01' },
  [CHAIN.ARBITRUM]: { id: 42161, start: '2021-09-22' },
  [CHAIN.AVAX]: { id: 43114, start: '2021-06-01' },
  [CHAIN.BSC]: { id: 56, start: '2021-06-01' },
  [CHAIN.FANTOM]: { id: 250, start: '2021-06-01' },
  [CHAIN.OPTIMISM]: { id: 10, start: '2021-12-16' },
  [CHAIN.POLYGON]: { id: 137, start: '2021-06-01' },
  [CHAIN.LINEA]: { id: 59144, start: '2023-07-11' },
  [CHAIN.SCROLL]: { id: 534352, start: '2021-09-22' },
  [CHAIN.ERA]: { id: 324, start: '2023-03-24' },
  [CHAIN.BASE]: { id: 8453, start: '2023-08-09' },
  [CHAIN.PLASMA]: { id: 9745, start: '2025-09-24' },
  [CHAIN.SONIC]: { id: 146, start: '2024-12-18' },
  [CHAIN.BERACHAIN]: { id: 80094, start: '2025-02-06' },
  [CHAIN.UNICHAIN]: { id: 130, start: '2025-02-11' },
  [CHAIN.HYPERLIQUID]: { id: 999, start: '2025-07-09' },
  [CHAIN.ETHERLINK]: { id: 42793, start: '2025-10-02' },
  [CHAIN.MONAD]: { id: 143, start: '2025-11-23' },
  // [CHAIN.CRONOS]: { id: 25, start: '2021-06-01' },
  // [CHAIN.MANTLE]: { id: 5000, start: '2023-07-17' },
  // [CHAIN.BLAST]: {id: 81457, start: '2024-02-29'},
  // [CHAIN.POLYGON_ZKEVM]: { id: 1101, start: '2023-03-27' },
  // [CHAIN.BITTORRENT]: {id: 199, start: '2021-06-01'},
};

const blacklistedTokens = [
  // UXLINK is hacked
  '0x1a6b3a62391eccaaa992ade44cd4afe6bec8cff1',

  // SFUND is hacked
  '0x477bc8d23c634c154061869478bce96be6045d12',
  '0x560363bda52bc6a44ca6c8c9b4a5fadbda32fa60',
  '0xb02f37a282c028958de65711158422199a61e9ae',
  '0x633e254585ade6e9d40d2a4b8cc2f3769b94cb48',
  '0x677db5a751fbd0b130ddc02715223d9da4a98f8f',

  // MAGA
  '0xda2e903b0b67f30bf26bd3464f9ee1a383bbbe5f',
  
  // TARA
  '0x2F42b7d686ca3EffC69778B6ED8493A7787b4d6E',
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
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
}

export default adapter;
