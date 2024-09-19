import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const duneQueryId: any = {
  [CHAIN.ETHEREUM]: '4082746',
  [CHAIN.BSC]: '4082749',
  [CHAIN.BASE]: '4082753',
}

async function fetchFees(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const rows = (await queryDune(duneQueryId[options.chain], {
    start: options.startTimestamp,
    end: options.startTimestamp + 24 * 60 * 60,
  }));
  rows.map((botTrade: any) => {
    dailyFees.addGasToken(botTrade.fee_usd);
  })
  return {
    dailyFees: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: 1685577600,
      runAtCurrTime: true,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: 1685577600,
      runAtCurrTime: true,
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: 1685577600,
      runAtCurrTime: true,
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
