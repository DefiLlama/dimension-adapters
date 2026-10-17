import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";

const starknet = sdk.chains.starknet

const FACTORY = '0x00eaf728d8e09bfbe5f11881f848ca647ba41593502347ed2ec5881e46b57a32'
// Pair event: Swap(sender, amount0_in: Uint256, amount1_in: Uint256, amount0_out: Uint256, amount1_out: Uint256, to)
const SWAP_SELECTOR = starknet.getSelectorFromName('Swap')

const CG_IDS: Record<string, string> = {
  [ADDRESSES.starknet.ETH]: 'ethereum',
  [ADDRESSES.starknet.DAI]: 'dai',
  [ADDRESSES.starknet.WBTC]: 'wrapped-bitcoin',
  [ADDRESSES.starknet.WSTETH]: 'wrapped-steth',
  [ADDRESSES.starknet.RETH]: 'rocket-pool-eth',
  [ADDRESSES.starknet.STRK]: 'starknet',
  [ADDRESSES.starknet.USDC]: 'usd-coin',
  [ADDRESSES.starknet.USDT]: 'tether',
}

// same page-size floor and error match as the sdk starknet getLogs helper
const MIN_EVENTS_CHUNK_SIZE = 100
const isPageSizeError = (e: any) => /page size|chunk_size|chunk size/.test(String(e?.message ?? e).toLowerCase())

const felt = (name: string) => ({ name, type: 'felt' })
const abis = {
  allPairsLength: { name: 'allPairsLength', inputs: [], outputs: [felt('res')] },
  allPairs: { name: 'allPairs', inputs: [felt('pid')], outputs: [felt('res')], customType: 'address' },
  getMetadata: { name: 'getMetadata', inputs: [], outputs: ['pid', 'stable', 'token0', 'token1', 'decimals0', 'decimals1'].map(felt) },
}

const uint256 = (data: string[], i: number) => BigInt(data[i]) + (BigInt(data[i + 1]) << 128n)

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  const fromBlock = (await starknet.getBlockAtTimestamp({ timestamp: options.fromTimestamp })).number + 1
  const toBlock = (await starknet.getBlockAtTimestamp({ timestamp: options.toTimestamp })).number
  if (fromBlock > toBlock) return { dailyVolume }

  const pairCount = Number(await starknet.call({ target: FACTORY, abi: abis.allPairsLength }))
  const pairs: string[] = await starknet.multiCall({ target: FACTORY, abi: abis.allPairs, calls: Array.from({ length: pairCount }, (_, i) => ({ params: [i + 1] })) })
  const metadata = await starknet.multiCall({ abi: abis.getMetadata, calls: pairs })

  // the leg each swap is valued on: token0 if it is a core asset, else token1, pairs without a core asset are skipped
  const legs = new Map<bigint, { token: string, isToken0: boolean, scale: number }>()
  pairs.forEach((pair, i) => {
    const [token0, token1] = [starknet.addAddressPadding(metadata[i].token0), starknet.addAddressPadding(metadata[i].token1)]
    if (isCoreAsset(options.chain, token0)) legs.set(BigInt(pair), { token: token0, isToken0: true, scale: Number(metadata[i].decimals0) })
    else if (isCoreAsset(options.chain, token1)) legs.set(BigInt(pair), { token: token1, isToken0: false, scale: Number(metadata[i].decimals1) })
  })

  let continuation_token: string | undefined
  let chunk_size = starknet.DEFAULT_EVENTS_CHUNK_SIZE
  while (true) {
    let page: any
    try {
      page = await starknet.rpc('starknet_getEvents', [{
        from_block: { block_number: fromBlock },
        to_block: { block_number: toBlock },
        keys: [[SWAP_SELECTOR]],
        chunk_size,
        ...(continuation_token ? { continuation_token } : {}),
      }])
    } catch (e) {
      if (chunk_size > MIN_EVENTS_CHUNK_SIZE && isPageSizeError(e)) { chunk_size = Math.max(MIN_EVENTS_CHUNK_SIZE, Math.floor(chunk_size / 2)); continue }
      throw e
    }
    for (const event of page.events) {
      const leg = legs.get(BigInt(event.from_address))
      if (!leg) continue
      const amount = leg.isToken0 ? uint256(event.data, 1) + uint256(event.data, 5) : uint256(event.data, 3) + uint256(event.data, 7)
      const cgId = CG_IDS[leg.token]
      if (cgId) dailyVolume.addCGToken(cgId, Number(amount) / leg.scale)
      else dailyVolume.add(leg.token, amount.toString())
    }
    if (!page.continuation_token) break
    continuation_token = page.continuation_token
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.STARKNET],
  start: '2023-01-10',
  methodology: {
    Volume: 'Swap events emitted by every pair created by the SithSwap factory on Starknet, valued on one side of each swap (the core-asset leg, amount in + amount out); pairs without a core asset are not counted.',
  },
}

export default adapter;
