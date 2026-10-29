import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchTransfersFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { nullAddress } from "../../helpers/token";
import { formatAddress } from "../../utils/utils";

// HyperDex (https://hyperdex.app) - swap and bridge aggregator for tokenized stocks and other RWAs.
//
// LI.FI: orders are executed by LI.FI's diamond under the integrator string "hyperdex". On chains whose
// tokens DefiLlama prices, same-chain volume is the LiFiGenericSwapCompleted logs carrying that integrator
// (the same event and token filter as aggregators/lifi and aggregators/jumper-exchange). Solana has no logs
// indexer here, and most Robinhood Chain tokens HyperDex trades (HYDX, EMPIREX, U, ...) have no DefiLlama
// price, so a log there counts $0: both are read from LI.FI's analytics API for integrator "hyperdex",
// valued in USD by LI.FI.
//
// Fynd: HyperDex also routes same-chain swaps through Fynd's TychoRouter with a 15 bp client fee, taken from
// the output token and split in the router's FeesTaken event between Fynd and HyperDex's fee receiver. A
// FeesTaken log naming HyperDex's receiver is one HyperDex swap; its output amount is the fee legs / 15 bp.
//
// Diamond addresses: https://github.com/lifinance/contracts/tree/main/deployments (LiFiDiamond)

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const FyndFeesTakenEvent = "event FeesTaken(address indexed token, (address recipient, uint256 amount)[] fees)"
const INTEGRATORS = ['hyperdex']
const NATIVE = nullAddress
// HyperDex's Fynd client-fee receiver and rate (15 bp of the output, split with Fynd inside it)
const HYPERDEX_FYND_RECEIVER = '0xf3619a5029bc4d7de640d22640cab564aeb34735'
const FYND_FEE_BPS = 15

const chainConfig: Record<string, { diamond?: string; lifiChainId?: number; fyndRouter?: string; start: string }> = {
  // API-routed: most tokens traded here have no DefiLlama price
  [CHAIN.ROBINHOOD]: { lifiChainId: 4663, fyndRouter: '0x09215a470bd585e59eb3f4b612fbd2678131ff9e', start: '2026-09-16' },
  [CHAIN.BASE]: { diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ARBITRUM]: { diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ETHEREUM]: { diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.BSC]: { diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ARC]: { diamond: '0xA4072583658Fae592A3506A42431cb6316a8d40b', start: '2026-09-16' },
  // API-routed: LI.FI's Solana program emits no EVM logs
  [CHAIN.SOLANA]: { lifiChainId: 1151111081099710, start: '2026-09-16' },
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { diamond, lifiChainId, fyndRouter } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()

  if (lifiChainId) {
    // every hyperdex transfer in the window, all chains (the helper has no numeric LI.FI chainId for Robinhood), kept to this chain
    const transfers = await fetchTransfersFromLIFIAPI(options.startTimestamp, options.endTimestamp, INTEGRATORS)
    transfers.forEach((tx) => {
      if (tx.sending.chainId === lifiChainId && tx.receiving.chainId === lifiChainId) dailyVolume.addUSDValue(Number(tx.sending.amountUSD) || 0)
    })
  } else if (diamond) {
    let logs: any[] = await options.getLogs({
      target: diamond,
      eventAbi: LifiSwapEvent,
      maxBlockRange: 10000,
    })

    // count volume only from whitelisted tokens (same filter as the LI.FI adapters)
    const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
    if (blacklistedTokens.length > 0) {
      logs = logs.filter(log => !blacklistedTokens.includes(formatAddress(log.fromAssetId)) && !blacklistedTokens.includes(formatAddress(log.toAssetId)))
    }

    logs.forEach((log: any) => {
      if (!INTEGRATORS.includes(log.integrator)) return
      // Native-in facets always emit fromAssetId=0x0 with a caller-declared fromAmount; count the
      // ERC20 out instead, which is measured from the diamond's balance (as in aggregators/lifi)
      if (formatAddress(log.fromAssetId) === NATIVE) dailyVolume.add(log.toAssetId, log.toAmount)
      else dailyVolume.add(log.fromAssetId, log.fromAmount)
    })
  }

  if (fyndRouter) {
    const feeLogs: any[] = await options.getLogs({ target: fyndRouter, eventAbi: FyndFeesTakenEvent })
    feeLogs.forEach((log: any) => {
      const fees: any[] = log.fees
      if (!fees.some((f: any) => formatAddress(f.recipient) === HYPERDEX_FYND_RECEIVER)) return
      const total = fees.reduce((sum: bigint, f: any) => sum + BigInt(f.amount), 0n)
      dailyVolume.add(log.token, (total * 10_000n) / BigInt(FYND_FEE_BPS))
    })
  }

  return { dailyVolume } as any
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Same-chain swap volume HyperDex routes. LI.FI (integrator "hyperdex"): on Ethereum, Base, Arbitrum, BNB Chain and Arc every LiFiGenericSwapCompleted log on the LI.FI diamond carrying that integrator, counted at the input amount, or at the output amount when the input is the native coin; on chains with a DefiLlama token list only whitelisted, non-blacklisted tokens count, as in aggregators/lifi. Robinhood Chain and Solana: same-chain transfers for integrator "hyperdex" from LI.FI\'s analytics API, valued in USD by LI.FI (most Robinhood Chain tokens have no DefiLlama price). Fynd (Robinhood Chain): every FeesTaken log on Fynd\'s TychoRouter that pays HyperDex\'s fee receiver, counted at the output amount (the fee legs divided by HyperDex\'s 15 bp client fee).',
  },
}

export default adapter
