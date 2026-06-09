import { CHAIN } from "../helpers/chains"
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived, getETHReceived } from "../helpers/token";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";

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
  [CHAIN.MEGAETH]: { id: 4326, start: '2026-02-09' },
  // [CHAIN.CRONOS]: { id: 25, start: '2021-06-01' },
  // [CHAIN.MANTLE]: { id: 5000, start: '2023-07-17' },
  // [CHAIN.BLAST]: {id: 81457, start: '2024-02-29'},
  // [CHAIN.POLYGON_ZKEVM]: { id: 1101, start: '2023-03-27' },
  // [CHAIN.BITTORRENT]: {id: 199, start: '2021-06-01'},
};

// Chains where the helper's Allium native-trace fallback is wired (ALLIUM_CHAIN_MAP).
// Outside this set getETHReceived would resolve to a non-existent schema and throw, so
// the existing addTokensReceived (ERC20-only) path stays in effect on those chains.
const nativeFeeChains = new Set<string>([
  CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.AVAX, CHAIN.BSC, CHAIN.OPTIMISM,
  CHAIN.POLYGON, CHAIN.SCROLL, CHAIN.BASE, CHAIN.PLASMA, CHAIN.BERACHAIN,
  CHAIN.UNICHAIN, CHAIN.MONAD, CHAIN.ERA
])

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

  // MGR
  '0x3e4802f35A7B388EC78C2d3F6286Ddac2576F9fC',
]

const feeCollector = "0x4f82e73edb06d29ff62c91ec8f5ff06571bdeb29"

async function fetch(options: FetchOptions) {
  // ERC20 fees: KyberSwap's MetaAggregationRouterV2 sends the protocol cut to the
  // feeCollector as an ERC20 Transfer for non-native trades.
  const dailyFees = await addTokensReceived({ target: feeCollector, options })

  // Native gas-token fees: the same router forwards native ETH / BNB / etc. via an
  // internal call when the trade pays in the chain's native token. These do not emit
  // Transfer events and are invisible to addTokensReceived. Pull them from Allium's
  // native_token_transfers / traces table. Sender on every chain is the router
  // 0x8f10b468b06c6fd214b65f87778827f7d113f996 (CREATE2-deployed at the same address
  // on every supported chain) — verified across Ethereum / Base / BSC / Arbitrum.
  if (nativeFeeChains.has(options.chain)) {
    await getETHReceived({ target: feeCollector, options, balances: dailyFees })
  }

  const defaultBlacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
  blacklistedTokens.forEach(t => dailyFees.removeTokenBalance(t))
  defaultBlacklistedTokens.forEach(t => dailyFees.removeTokenBalance(t))

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 }
}

const methodology = {
  Fees: 'Aggregator fees retained by KyberSwap on routed swaps. Pulled from both ERC20 Transfer events into the fee collector and from native gas-token internal transfers on chains where the indexer covers them.',
  UserFees: 'Aggregator fees paid by users on KyberSwap-routed swaps.',
  Revenue: 'All collected aggregator fees retained by KyberSwap.',
  ProtocolRevenue: 'All collected aggregator fees retained by KyberSwap.',
  HoldersRevenue: 'No revenue share to KNC token holders from aggregator fees.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  adapter: chainConfig,
  methodology,
}

export default adapter;
