import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { nullAddress } from "../../helpers/token";
import { formatAddress } from "../../utils/utils";

// HyperDex (https://hyperdex.app) - swap and bridge aggregator for tokenized stocks and other RWAs.
// Orders are executed by LI.FI's diamond under the integrator string "hyperdex", so same-chain volume
// is the LiFiGenericSwapCompleted logs carrying that integrator (the same event and token filter as
// aggregators/lifi and aggregators/jumper-exchange). Solana has no logs indexer here and is read
// from LI.FI's analytics API, filtered by the same integrator.
//
// Diamond addresses: https://github.com/lifinance/contracts/tree/main/deployments (LiFiDiamond)

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)"
const INTEGRATORS = ['hyperdex']
const NATIVE = nullAddress

const chainConfig: Record<string, { diamond?: string; start: string }> = {
  [CHAIN.ROBINHOOD]: { diamond: '0xB477751B76CF82d00a686A1232f5fCD772414Af3', start: '2026-09-16' },
  [CHAIN.BASE]: { diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ARBITRUM]: { diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ETHEREUM]: { diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ARC]: { diamond: '0xA4072583658Fae592A3506A42431cb6316a8d40b', start: '2026-09-16' },
  // API-routed: LI.FI's Solana program emits no EVM logs
  [CHAIN.SOLANA]: { start: '2026-09-16' },
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { diamond } = chainConfig[options.chain]
  if (!diamond) {
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, INTEGRATORS, [], 'same-chain')
    return { dailyVolume } as any
  }

  const dailyVolume = options.createBalances()
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

  return { dailyVolume } as any
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Same-chain swap volume executed through LI.FI for integrator "hyperdex". EVM chains: every LiFiGenericSwapCompleted log on the LI.FI diamond carrying that integrator, counted at the input amount, or at the output amount when the input is the native coin (native-in facets emit a caller-declared fromAmount). On chains with a DefiLlama token list (Ethereum, Base, Arbitrum) only whitelisted, non-blacklisted tokens count, as in aggregators/lifi; Robinhood Chain and Arc have no list yet, so every hyperdex swap there counts. Solana: same-chain transfers for integrator "hyperdex" from LI.FI\'s analytics API, valued in USD by LI.FI.',
  },
}

export default adapter
