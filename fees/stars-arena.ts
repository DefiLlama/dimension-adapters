import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

interface IFee {
  day: string;
  fees_usd: number;
  rev_usd: number;
}


const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  try {
    const fees: IFee[] = (await queryDune("3083702"));
    // const fees = temp;
    const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];
    const daily = fees.find((e: IFee) => e.day.split(' ')[0] === dateStr);
    const dailyFees = daily?.fees_usd || 0;
    const dailyRevenue = daily?.rev_usd || 0;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (e) {
    console.error(e)
    throw e;
  }

}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: async () => 1695081600,
    }
  }
}

export default adapters;
