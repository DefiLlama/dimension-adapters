import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";


interface IFees {
  block_date: string;
  total_fees: number;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
        const next = startOfDay + 86400;
        const _dailyFees: IFees = (await queryDune('3277066', { endTime: next, }))[0]

        const dailyFees = createBalances()
        dailyFees.addCGToken('solana', _dailyFees.total_fees)
        const dailyRevenue = dailyFees.clone(0.5)

        return {
          timestamp,
          dailyFees: dailyFees,
          dailyRevenue: dailyRevenue,
          dailyHoldersRevenue: dailyRevenue,
        };
      },
      start: 1610841600,
      runAtCurrTime: true,
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN
}

export default adapter;
