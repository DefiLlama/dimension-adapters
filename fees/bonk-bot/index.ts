import { FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

interface IFees {
  block_date: string;
  feesUSD: number;
}
const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const result = await queryDune("3211435");
  const date = new Date(timestamp * 1000);
  const dateTime = date.toISOString().split('T')[0];
  const dayItem = result.find((item: IFees) => item.block_date.split(' ')[0] === dateTime);
  return {
    dailyFees: dayItem?.feesUSD ?? 0,
    dailyRevenue: dayItem?.feesUSD ?? 0,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: 1692748800,
      runAtCurrTime: true,
    }
  }
}

export default adapter;
