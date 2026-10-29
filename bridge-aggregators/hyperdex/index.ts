import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// HyperDex (https://hyperdex.app) - swap and bridge aggregator for tokenized stocks and other RWAs.
// Cross-chain orders are executed by LI.FI's diamond under the integrator string "hyperdex", so
// bridge volume is the LiFiTransferStarted logs carrying that integrator (the same event as
// bridge-aggregators/lifi and bridge-aggregators/jumper.exchange). Solana has no logs indexer here
// and is read from LI.FI's analytics API, filtered by the same integrator.
//
// Most of HyperDex's volume is cross-chain (into and out of Robinhood Chain), so this is the primary
// volume listing; same-chain swaps are in aggregators/hyperdex.
//
// RAVN, Velora and Hinkal: HyperDex's other route sources leave nothing on-chain that names HyperDex, so their
// completed cross-chain swaps are read from HyperDex's own swap record, the list https://hyperdex.app/explorer
// shows, at each swap's dollar amount when sent, on the sending chain: https://hyperdex.app/api/defillama (LI.FI
// is not in it, so nothing is counted twice).
//
// Diamond addresses: https://github.com/lifinance/contracts/tree/main/deployments (LiFiDiamond)

const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)"
const INTEGRATORS = ['hyperdex']
const HYPERDEX_API = 'https://hyperdex.app/api/defillama'

// chainId: the chain's id in HyperDex's record; lifi: how LI.FI's transfers are read there (none: HyperDex's record only)
const chainConfig: Record<string, { chainId: number; lifi?: 'logs' | 'api'; diamond?: string; start: string }> = {
  [CHAIN.ROBINHOOD]: { chainId: 4663, lifi: 'logs', diamond: '0xB477751B76CF82d00a686A1232f5fCD772414Af3', start: '2026-09-16' },
  [CHAIN.BASE]: { chainId: 8453, lifi: 'logs', diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ARBITRUM]: { chainId: 42161, lifi: 'logs', diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ETHEREUM]: { chainId: 1, lifi: 'logs', diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.BSC]: { chainId: 56, lifi: 'logs', diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.OPTIMISM]: { chainId: 10, lifi: 'logs', diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.XDAI]: { chainId: 100, lifi: 'logs', diamond: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', start: '2026-09-16' },
  [CHAIN.ARC]: { chainId: 5042, lifi: 'logs', diamond: '0xA4072583658Fae592A3506A42431cb6316a8d40b', start: '2026-09-16' },
  // API-routed: LI.FI's Solana program emits no EVM logs
  [CHAIN.SOLANA]: { chainId: 1151111081099710, lifi: 'api', start: '2026-09-16' },
  // HyperDex's record only (no LI.FI bridges from here)
  [CHAIN.POLYGON]: { chainId: 137, start: '2026-10-11' },
  [CHAIN.AVAX]: { chainId: 43114, start: '2026-10-11' },
  [CHAIN.ERA]: { chainId: 324, start: '2026-10-11' },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: '2026-10-11' },
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { chainId, lifi, diamond } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()

  // RAVN, Velora and Hinkal cross-chain swaps from HyperDex's record, in USD, on the sending chain
  const record = await httpGet(`${HYPERDEX_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`)
  Object.values(record.bridges?.[chainId] ?? {}).forEach((usd: any) => dailyVolume.addUSDValue(Number(usd) || 0))

  if (lifi === 'api') {
    dailyVolume.addUSDValue(await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, INTEGRATORS, [], 'cross-chain'))
  } else if (lifi === 'logs' && diamond) {
    const logs: any[] = await options.getLogs({
      target: diamond,
      eventAbi: LifiBridgeEvent,
      maxBlockRange: 10000,
    })
    logs.forEach((e: any) => {
      const { bridgeData: { integrator, sendingAssetId, minAmount } } = e
      if (INTEGRATORS.includes(integrator)) dailyVolume.add(sendingAssetId, minAmount)
    })
  }

  return { dailyBridgeVolume: dailyVolume } as any
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    BridgeVolume: 'Cross-chain volume executed through LI.FI for integrator "hyperdex": the sent amount of every LiFiTransferStarted log carrying that integrator, on the sending chain. RAVN, Velora and Hinkal: completed cross-chain swaps from HyperDex\'s own swap record (https://hyperdex.app/api/defillama, the list hyperdex.app/explorer shows), at each swap\'s dollar amount when sent, on the sending chain.',
  },
}

export default adapter
