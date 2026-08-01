import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi = {
  gamesFunction: 'function games(bytes32 gameId) view returns (uint128 players, uint128 capacity, address resolver, address creator, uint256 amount, address token, bool settled)',
  resolveEvent: 'event Resolved(bytes32 gameId, address[] winners, uint256[] amounts)'
}
const RoyaleTokenContract = {
  [CHAIN.WC.valueOf()]: '0x03D6ec933E452283a0CaC468F487F327d1baE9ba',
}
const resolverAddresses = [
  '0x38Ce1e9845795cdA4e6C3373d3d458FaE11A17F3',
  '0xF26Eb487F1E108272346CBCEED0e30e18E4d88ce',
  '0xD8a59935ef87E0482ADf1104C076811a4C90c0c0',
  '0x9d17c08eA82Fe8e88D1727623CFec77b29aDD1Cf'
].map(address => address.toLowerCase())

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, toApi }: FetchOptions): Promise<FetchResultV2> => {
  const target = RoyaleTokenContract[chain] as `0x${string}`
  const dailyFees = createBalances()
  const resolveEvents = await getLogs({ target, eventAbi: abi.resolveEvent })
  const gameIds: `0x${string}`[] = Array.from(new Set(resolveEvents.map(event => event.gameId)))
  const games = await toApi.multiCall({
    target,
    abi: abi.gamesFunction,
    calls: gameIds.map(gameId => ({ params: [gameId] }))
  })
  const gameIdToGame = new Map(gameIds.map((gameId, idx) => [gameId, games[idx]]))
  resolveEvents.forEach(event => {
    const game = gameIdToGame.get(event.gameId)
    if (game && resolverAddresses.includes(game.resolver.toLowerCase())) {
      const totalPot = BigInt(game.amount) * BigInt(game.players);
      const totalPayout = event.amounts.reduce((acc, amount) => acc + amount, 0n);
      const fees = totalPot - totalPayout;
      dailyFees.add(game.token, fees)
    }
  })

  return { dailyFees, dailyRevenue: dailyFees }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'Fees are calculated as sum of all Transfer events to the royale resolver',
    Revenue: 'Revenue is the same as fees'
  },
  adapter: {
    [CHAIN.WC]: {
      fetch,
      start: '2025-05-02',
    },
  }
};

export default adapter;
