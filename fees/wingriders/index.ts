import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url: string = "https://api.mainnet.wingriders.com/v1/defillama";

const fetch = async (_:number, _t: any, options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { dailyVolume, dailyFees },
  } = await axios.get(url);

  const getBalances = (valueInAda: any) => {
    const balances = options.createBalances();
    balances.addCGToken('cardano', Number(valueInAda));
    return balances;
  }
  return {
    timestamp: options.startOfDay,
    dailyVolume: getBalances(dailyVolume),
    dailyFees: getBalances(dailyFees),
    dailyUserFees: getBalances(dailyFees),
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2022-04-01',
      runAtCurrTime: true,
    },
  },
};

export default adapter;
