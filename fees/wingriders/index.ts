import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const url: string = "https://api.mainnet.wingriders.com/v1/defillama";

const fetch = async (_a:any, _b:any, options: FetchOptions): Promise<FetchResult> => {
  const data = await fetchURL(url);

  const getBalances = (valueInAda: any) => {
    const balances = options.createBalances();
    balances.addCGToken('cardano', Number(valueInAda));
    return balances;
  }
  const dailyFees = getBalances(data.dailyFees);

  return {
    dailyFees, dailyUserFees: dailyFees,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  start: '2022-04-01',
  runAtCurrTime: true,
};

export default adapter;
