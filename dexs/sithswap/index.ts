import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const starknet = sdk.chains.starknet

const FACTORY = '0x00eaf728d8e09bfbe5f11881f848ca647ba41593502347ed2ec5881e46b57a32'
// Pair event: Swap(sender, amount0_in: Uint256, amount1_in: Uint256, amount0_out: Uint256, amount1_out: Uint256, to)
const SWAP_SELECTOR = starknet.getSelectorFromName('Swap')

const felt = (name: string) => ({ name, type: 'felt' })
const abis = {
  allPairsLength: { name: 'allPairsLength', inputs: [], outputs: [felt('res')] },
  allPairs: { name: 'allPairs', inputs: [felt('pid')], outputs: [felt('res')], customType: 'address' },
  getTokens: { name: 'getTokens', inputs: [], outputs: [felt('token0'), felt('token1')] },
}

const uint256 = (data: string[], i: number) => BigInt(data[i]) + (BigInt(data[i + 1]) << 128n)

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  const fromBlock = (await starknet.getBlockAtTimestamp({ timestamp: options.fromTimestamp })).number + 1
  const toBlock = (await starknet.getBlockAtTimestamp({ timestamp: options.toTimestamp })).number
  if (fromBlock > toBlock) return { dailyVolume }

  const pairCount = Number(await starknet.call({ target: FACTORY, abi: abis.allPairsLength }))
  const pairs: string[] = await starknet.multiCall({ target: FACTORY, abi: abis.allPairs, calls: Array.from({ length: pairCount }, (_, i) => ({ params: [i + 1] })) })
  const tokens = await starknet.multiCall({ abi: abis.getTokens, calls: pairs })
  const pairTokens = new Map<bigint, string[]>()
  pairs.forEach((pair, i) => pairTokens.set(BigInt(pair), [starknet.addAddressPadding(tokens[i].token0), starknet.addAddressPadding(tokens[i].token1)]))

  let continuation_token: string | undefined
  do {
    const page = await starknet.rpc('starknet_getEvents', [{
      from_block: { block_number: fromBlock },
      to_block: { block_number: toBlock },
      keys: [[SWAP_SELECTOR]],
      chunk_size: starknet.DEFAULT_EVENTS_CHUNK_SIZE,
      ...(continuation_token ? { continuation_token } : {}),
    }])
    for (const event of page.events) {
      const pairToken = pairTokens.get(BigInt(event.from_address))
      if (!pairToken) continue
      const [token0, token1] = pairToken
      const amount0 = uint256(event.data, 1) + uint256(event.data, 5)
      const amount1 = uint256(event.data, 3) + uint256(event.data, 7)
      addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: amount0.toString(), amount1: amount1.toString() })
    }
    continuation_token = page.continuation_token
  } while (continuation_token)

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.STARKNET],
  start: '2023-01-10',
  methodology: {
    Volume: 'Swap events emitted by every pair created by the SithSwap factory on Starknet, valued on one side of each swap (the core-asset leg, amount in + amount out).',
  },
}

export default adapter;
