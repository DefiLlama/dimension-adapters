import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi = {
  balanceFunction: 'function balance(address currency, address user) external view returns (uint256 available, uint256 locked)',
  coinEvent: 'event Coin(bytes32 puzzleId, address creator, address player, uint256 toll, uint256 escrow, uint96 expiryTimestamp, address currency)',
  solveEvent: 'event Solve(bytes32 puzzleId, uint256 payout)'
}
const arcadeContract = {
  [CHAIN.ABSTRACT.valueOf()]: '0x0b4429576e5eD44a1B8f676c8217eb45707AFa3D',
}
const feeCollectorAddress = '0x1db01E95DCb9bd2418D3cbED2d3d1600389c8b40'

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, getFromBlock, getToBlock, getBlock, fromTimestamp, fromApi, toApi }: FetchOptions): Promise<FetchResultV2> => {
  const target = arcadeContract[chain] as `0x${string}`

  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const [twoDaysAgoFromBlock, fromBlock, toBlock] = await Promise.all([
    getBlock(fromTimestamp - 2 * 24 * 3600, chain, {}),
    getFromBlock(),
    getToBlock()
  ])
  const currencyOfPuzzleId: Record<string, string> = {}
  const currencySet = new Set<string>()

  const [coinEventsFromTwoDaysAgo, coinEvents, solveEvents] = await Promise.all([
    getLogs({ target, eventAbi: abi.coinEvent, fromBlock: twoDaysAgoFromBlock, toBlock: fromBlock }),
    getLogs({ target, eventAbi: abi.coinEvent, }),
    getLogs({ target, eventAbi: abi.solveEvent, }),
  ])

  coinEventsFromTwoDaysAgo.forEach(i => {
    currencyOfPuzzleId[i.puzzleId] = i.currency
    currencySet.add(i.currency)
  })
  coinEvents.forEach(i => {
    currencyOfPuzzleId[i.puzzleId] = i.currency
    currencySet.add(i.currency)
    dailyVolume.add(i.currency, i.toll)
  })
  solveEvents.forEach(i => {
    const currency = currencyOfPuzzleId[i.puzzleId]
    if (currency) {
      dailyVolume.add(currency, i.payout)
    }
  })

  const currencyList = Array.from(currencySet)
  const balancesBefore = await fromApi.multiCall({
    target,
    abi: abi.balanceFunction,
    calls: currencyList.map(currency => ({ params: [currency, feeCollectorAddress], })),
  })
  const balancesAfter = await toApi.multiCall({
    target,
    abi: abi.balanceFunction,
    calls: currencyList.map(currency => ({ params: [currency, feeCollectorAddress], })),
  })
  balancesAfter.forEach((i, idx) => {
    const currency = currencyList[idx]
    const before = balancesBefore[idx]
    dailyFees.add(currency, i.available - before.available)
  })

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees }
};

const adapter: SimpleAdapter = {
  methodology: {
    Volume: 'Volume is calculated as the sum of tolls collected from Coin events and payouts from Solve events',
    Fees: 'Fees are calculated as the difference in available balance of the fee collector address before and after the block',
    Revenue: 'Revenue is the same as fees'
  },
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-01-30',
    },
  }
};

export default adapter;
