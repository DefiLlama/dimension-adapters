import fetchURL from "../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const dateFrom = 1630584906;
const recentSalesEndpoint = `https://api.paintswap.finance/v2/sales?numToFetch=1000&sold=true&orderDirection=desc`;
//NFT sales fee is 2.5%
const salesFee = 2.5;

interface ISale {
  endTime: number;
  price: number;
}

const fetch = async (_timestamp: number, _: ChainBlocks, { startOfDay, createBalances, }: FetchOptions) => {
  const dailyUserFees = createBalances();
  const pastSales: ISale[] = (await fetchURL(recentSalesEndpoint)).sales;
  //helper function to group by days
  const formatDate = (unixTimestamp: number): string => {
    return new Date(unixTimestamp).toISOString().split("T")[0]; // Convert to YYYY-MM-DD
  };

  const groupedSales = pastSales.reduce((feeSum, sale) => {
    const day = formatDate(Number(sale.endTime * 1000)); // Convert timestamp to date for grouping
    const dayTimestamp = new Date(day).getTime() / 1000;
    feeSum[dayTimestamp] = (feeSum[dayTimestamp] || 0) + Number(sale.price) * (salesFee / 100); // Sum up sale fees per day
    return feeSum;
  }, {} as Record<string, number>);

  dailyUserFees.addGasToken(groupedSales[startOfDay] ?? 0);

  const dailyRevenue = dailyUserFees.clone(0.5)
  return {
    timestamp: startOfDay,
    dailyUserFees,
    dailyFees: dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,

  };
};


const adapter: SimpleAdapter = {
  methodology: {
    Fees: `${salesFee}% of each successful NFT sale is charged as a platform fee.`
  },
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2021-09-02',
    },
  },
};

export default adapter;
