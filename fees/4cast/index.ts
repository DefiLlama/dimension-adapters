import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

interface IData {
  dailyFees: string;
}

const endpoint = "https://app.memecast.ai/api/api/platformFees";

function createSolBalances(options: FetchOptions, value: string) {
  const balances = options.createBalances();

  balances.add(ADDRESSES.solana.SOL, Number(value) * 1e9);

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
  deadFrom: '2025-03-20',
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2024-07-17',
    },
  },
        methodology: {
          Fees: "Tokens trading and launching fees paid by users.",
        }
};

export default adapter;
