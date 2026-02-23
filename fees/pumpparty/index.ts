import type { SimpleAdapter } from "../../adapters/types";
import { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi = {
  gameCreationEvent: 'event GameCreated(bytes32 gameId, address player, address resolver, address token, uint256 betAmount, bytes32 gameSeedHash, bytes32 salt)',
  payoutEvent: 'event PayoutSent(bytes32 gameId, address resolver, address token, uint256 amount, address recipient, bytes32 gameState, bytes32 gameSeed)'
}
const CommitRevealContract = {
  [CHAIN.MEGAETH.valueOf()]: '0x6CA22286D318250c823e38F741da26878e96fC4D',
}
const pumpPartyResolverAddress = '0x7A55Dc267F85223Db2bC6ab41BF5e70dcE90749C'

const fetch: FetchV2 = async ({ getLogs, createBalances, chain }: FetchOptions): Promise<FetchResultV2> => {
  const target = CommitRevealContract[chain] as `0x${string}`
  const dailyFees = createBalances()
  const gameCreationEvents = await getLogs({ target, eventAbi: abi.gameCreationEvent })
  const payoutEvents = await getLogs({ target, eventAbi: abi.payoutEvent })

  for (const e of gameCreationEvents) {
    if (e.resolver.toLowerCase() === pumpPartyResolverAddress.toLowerCase())
      dailyFees.add(e.token, e.betAmount)
  }
  for (const e of payoutEvents) {
    if (e.resolver.toLowerCase() === pumpPartyResolverAddress.toLowerCase())
      dailyFees.add(e.token, -e.amount)
  }

  return { dailyFees, dailyRevenue: dailyFees }
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Fees are calculated as the difference between the total bet amount and the total payout amount',
    Revenue: 'Revenue is the same as fees'
  },
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: '2026-02-09',
    },
  }
};

export default adapter;
