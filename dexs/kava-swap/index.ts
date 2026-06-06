import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface ICallPoolData {
  denom: string;
  amount: string;
}

const URL = "https://swap-data.kava.io/v1/pools/internal";

const fetch = async ({ startOfDay, createBalances,}: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = createBalances();
  const poolCall = (await fetchURL(URL));
  const poolDetail = poolCall
    .map((pool: any) => pool.volume
    .map((p: ICallPoolData) => p)).flat();
  poolDetail.map((e:ICallPoolData) => {
    dailyVolume.add(e.denom, e.amount)
  });

  return {
    dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.KAVA],
  runAtCurrTime: true,
};

export default adapter;
