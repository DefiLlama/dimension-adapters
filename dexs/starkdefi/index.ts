import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken, isCoreAsset } from "../../helpers/prices";

const starknet = sdk.chains.starknet

// mainnet factory used by app.starkdefi.com
const FACTORY = '0x02721f5ab785ae5e13b276ca9d41e859b7b150440a288a7826ba5e27dd05e08e'
// Pair event: keys [Swap, sender, to], data [amount0In, amount1In, amount0Out, amount1Out] as u256 (low, high)
const SWAP_SELECTOR = starknet.getSelectorFromName('Swap')

// same page-size floor and error match as the sdk starknet getLogs helper
const MIN_EVENTS_CHUNK_SIZE = 100
const isPageSizeError = (e: any) => /page size|chunk_size|chunk size/.test(String(e?.message ?? e).toLowerCase())

const address = 'core::starknet::contract_address::ContractAddress'
const abis = {
  all_pairs: { name: 'all_pairs', type: 'function', inputs: [], outputs: [{ type: `(core::integer::u32, core::array::Array::<${address}>)` }], state_mutability: 'view' },
  token0: { name: 'token0', type: 'function', inputs: [], outputs: [{ type: address }], state_mutability: 'view', customType: 'address' },
  token1: { name: 'token1', type: 'function', inputs: [], outputs: [{ type: address }], state_mutability: 'view', customType: 'address' },
}

const uint256 = (data: string[], i: number) => BigInt(data[i]) + (BigInt(data[i + 1]) << 128n)

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  const fromBlock = (await starknet.getBlockAtTimestamp({ timestamp: options.fromTimestamp })).number + 1
  const toBlock = (await starknet.getBlockAtTimestamp({ timestamp: options.toTimestamp })).number
  if (fromBlock > toBlock) return { dailyVolume }

  const { 1: pairList } = await starknet.call({ target: FACTORY, abi: abis.all_pairs })
  const pairs: string[] = pairList.map((p: any) => starknet.addAddressPadding(p))
  const token0s: string[] = await starknet.multiCall({ abi: abis.token0, calls: pairs })
  const token1s: string[] = await starknet.multiCall({ abi: abis.token1, calls: pairs })

  // only pairs with a core asset, addOneToken then prices that leg
  const pairTokens = new Map<bigint, [string, string]>()
  pairs.forEach((pair, i) => {
    if (isCoreAsset(options.chain, token0s[i]) || isCoreAsset(options.chain, token1s[i]))
      pairTokens.set(BigInt(pair), [token0s[i], token1s[i]])
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
      const tokens = pairTokens.get(BigInt(event.from_address))
      if (!tokens) continue
      addOneToken({
        chain: options.chain, balances: dailyVolume, token0: tokens[0], token1: tokens[1],
        amount0: uint256(event.data, 0) + uint256(event.data, 4),
        amount1: uint256(event.data, 2) + uint256(event.data, 6),
      })
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
  start: '2023-11-26',
  methodology: {
    Volume: 'Swap events emitted by every pair created by the StarkDeFi factory on Starknet, valued on one side of each swap (the core-asset leg, amount in + amount out); pairs without a core asset are not counted.',
  },
}

export default adapter;
