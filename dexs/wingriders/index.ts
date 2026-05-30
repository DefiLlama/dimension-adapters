import { Adapter, ChainBlocks, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url: string = "https://api.mainnet.wingriders.com/v1/defillama";

async function fetch(_t: number, _: ChainBlocks, options: FetchOptions) {
    const data = await fetchURL(url);

    const getBalances = (valueInAda: any) => {
      const balances = options.createBalances();
      balances.addCGToken('cardano', Number(valueInAda));
      return balances;
    }
  
    const dailyVolume = getBalances(data.dailyVolume);
    const dailyFees = getBalances(data.dailyFees);

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
    }
}

export default {
    adapter: {
        [CHAIN.CARDANO]: {
            fetch,
            runAtCurrTime: true,
        }
    }
} as Adapter
