import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from '../../helpers/token';

const feeAddress = '0xD04086A2E18f4B1BB565A703EBeC56eaee2ACCA0';

const fetch = async (options: FetchOptions) => {
  const balances = options.createBalances();
  await getETHReceived({
    options,
    balances,
    target: feeAddress
  });
  
  return { dailyFees: balances, dailyRevenue: balances };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-05-17'
    }
  }
};

export default adapter;
