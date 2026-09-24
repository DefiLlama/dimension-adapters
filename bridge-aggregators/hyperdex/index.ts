import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchVolumeFromLIFIAPI } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";

// HyperDex (https://hyperdex.app) - swap and bridge aggregator for tokenized stocks and other RWAs.
// Cross-chain orders are executed by LI.FI's diamond under the integrator string "hyperdex", so
// bridge volume is the LiFiTransferStarted logs carrying that integrator (the same event as
// bridge-aggregators/lifi and bridge-aggregators/jumper.exchange). Solana has no logs indexer here
// and is read from LI.FI's analytics API, filtered by the same integrator.
//
// Most of HyperDex's volume is cross-chain (into and out of Robinhood Chain), so this is the primary
// volume listing; same-chain swaps are in aggregators/hyperdex.
//
// Diamond addresses: https://github.com/lifinance/contracts/tree/main/deployments (LiFiDiamond)

const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)"
const INTEGRATORS = ['hyperdex']

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
    const dailyVolume = await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, INTEGRATORS, [], 'cross-chain')
    return { dailyBridgeVolume: dailyVolume } as any
  }

  const dailyVolume = options.createBalances()
  const logs: any[] = await options.getLogs({
    target: diamond,
    eventAbi: LifiBridgeEvent,
    maxBlockRange: 10000,
  })
  logs.forEach((e: any) => {
    const { bridgeData: { integrator, sendingAssetId, minAmount } } = e
    if (INTEGRATORS.includes(integrator)) dailyVolume.add(sendingAssetId, minAmount)
  })

  return { dailyBridgeVolume: dailyVolume } as any
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    BridgeVolume: 'Cross-chain volume executed through LI.FI for integrator "hyperdex": the sent amount of every LiFiTransferStarted log carrying that integrator, on the sending chain.',
  },
}

export default adapter
