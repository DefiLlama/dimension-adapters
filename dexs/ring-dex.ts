import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter, } from '../adapters/types'
import { formatAddress } from '../utils/utils';
import { addOneToken } from '../helpers/prices';

interface IRingDexConfig {
  factory: string;
  start: string;
}

const RingDexConfigs: Record<string, IRingDexConfig> = {
  [CHAIN.ETHEREUM]: {
    factory: '0xeb2A625B704d73e82946D8d026E1F588Eed06416',
    start: '2024-07-07',
  },
  [CHAIN.BLAST]: {
    factory: '0x24F5Ac9A706De0cF795A8193F6AB3966B14ECfE6',
    start: '2024-03-01',
  },
  [CHAIN.BSC]: {
    factory: '0x4De602A30Ad7fEf8223dcf67A9fB704324C4dd9B',
    start: '2025-02-20',
  },
  [CHAIN.HYPERLIQUID]: {
    factory: '0x4AfC2e4cA0844ad153B090dc32e207c1DD74a8E4',
    start: '2025-07-18',
  },
}

const methodology = {
  Fees: 'User pays 0.3% fees on each swap.',
  Revenue: 'Protocol has no revenue.',
  SupplySideRevenue: 'All fees are distributed to LPs.',
}

const defaultV2SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)';

const fetch = async (_: number, _1: any, options: FetchOptions) => {
  const allPairsLength = await options.api.call({ target: RingDexConfigs[options.chain].factory, abi: 'uint256:allPairsLength' })
  const calls: Array<any> = [];
  for (let i = 0; i < Number(allPairsLength); i++) {
    calls.push({ params:[i] })
  }
  const allPairs = await options.api.multiCall({
    target: RingDexConfigs[options.chain].factory,
    abi: 'function allPairs(uint256) view returns(address)',
    calls,
  })
  const pairTokens0 = await options.api.multiCall({
    abi: 'address:token0',
    calls: allPairs,
  })
  const pairTokens1 = await options.api.multiCall({
    abi: 'address:token1',
    calls: allPairs,
  })
  const pairTokens0Underlying = await options.api.multiCall({
    abi: 'address:token',
    calls: pairTokens0,
    permitFailure: true,
  })
  const pairTokens1Underlying = await options.api.multiCall({
    abi: 'address:token',
    calls: pairTokens1,
    permitFailure: true,
  })

  const pairs: Record<string, Array<string>> = {};
  for (let i = 0; i < allPairs.length; i++) {
    pairs[formatAddress(allPairs[i])] = [
      pairTokens0Underlying[i] ? pairTokens0Underlying[i] : pairTokens0[i],
      pairTokens1Underlying[i] ? pairTokens1Underlying[i] : pairTokens1[i],
    ]
  }

  const dailyVolume = options.createBalances()
  const swapLogs: Array<any> = await options.getLogs({
    eventAbi: defaultV2SwapEvent,
    targets: allPairs,
    flatten: true,
    onlyArgs: false,
  })
  for (const log of swapLogs) {
    const tokens = pairs[formatAddress(log.address)];
    if (tokens) {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokens[0], token1: tokens[1], amount0: log.args.amount0In, amount1: log.args.amount1In })
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokens[0], token1: tokens[1], amount0: log.args.amount0Out, amount1: log.args.amount1Out })
    }
  }

  return {
    dailyVolume,
    dailyFees: dailyVolume.clone(0.003),
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyVolume.clone(0.003),
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  start: '2024-07-07',
  methodology,
  fetch,
  adapter: {}
}

for (const [chain, config] of Object.entries(RingDexConfigs)) {
  (adapter.adapter as any)[chain] = {
    start: config.start,
  }
}

export default adapter;
