import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from '../helpers/coreAssets.json';

const CHAIN_CONFIG = {
  [CHAIN.ETHEREUM]: { start: 20790869 },
  [CHAIN.BSC]: { start: 42387186 },
  [CHAIN.BASE]: { start: 20014325 },
  [CHAIN.ARBITRUM]: { start: 279127453 },
  // [CHAIN.GRAVITY]: { start: 23719062 },
  // [CHAIN.MORPH]: { start: 1125634 }
}

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // add native fee
  let feeTo = "0x521faAcDFA097ad35a32387727e468F7fD032fD6";

  await options.api.sumTokens({ owner: feeTo, token: ADDRESSES.null });
  await options.fromApi.sumTokens({ owner: feeTo, token: ADDRESSES.null });
  dailyFees.addBalances(options.api.getBalancesV2());
  dailyFees.subtract(options.fromApi.getBalancesV2());

  await addTokensReceived({ balances: dailyFees, target: feeTo, options, })


  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-09-20', },
    [CHAIN.BSC]: { fetch, start: '2024-09-19', },
    [CHAIN.BASE]: { fetch, start: '2024-09-20', },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-11-28', },
    [CHAIN.GRAVITY]: { fetch, start: '2024-12-11', },
    [CHAIN.MORPH]: { fetch, start: '2024-12-11', },
  },

}

export default adapter;
