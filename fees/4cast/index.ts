import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

interface IData {
  dailyFees: string;
}

const endpoint = "https://www.4cast.win/api/api/platformFees";

function createSolBalances(options: FetchOptions, value: string) {
  const balances = options.createBalances();

  balances.addGasToken(Number(value));

  return balances;
}

const fetch: FetchV2 = async (options) => {
  const data: IData = await postURL(endpoint, {
    startTimestamp: options.startTimestamp,
    endTimestamp: options.endTimestamp,
  });

  return {
    dailyFees: createSolBalances(options, data.dailyFees),
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: false,
      start: 1721174400,
    },
  },
};

export default adapter;
