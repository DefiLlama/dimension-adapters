import { Adapter, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FEE_PER_TRADE = 20;
const REVENUE_PER_TRADE = 6;
const RATIO = 1000;

export default {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const logs_sold = await getLogs({
          target: "0xe220E8d200d3e433b8CFa06397275C03994A5123",
          eventAbi: 'event Sold(address seller, address token, uint256 ethOut, uint256 tokensIn, uint256 priceNew)'
        });
        const logs_bought = await getLogs({
          target: "0xe220E8d200d3e433b8CFa06397275C03994A5123",
          eventAbi: 'event Bought(address buyer, address token, uint256 ethIn, uint256 tokensOut, uint256 priceNew)'
        });

        logs_sold.map((e: any) => {
          dailyFees.addGasToken(e[2] * BigInt(FEE_PER_TRADE) / BigInt(RATIO))
          dailyRevenue.addGasToken(e[2] * BigInt(REVENUE_PER_TRADE) / BigInt(RATIO))
        });
        logs_bought.map((e: any) => {
          dailyFees.addGasToken(e[2] * BigInt(FEE_PER_TRADE) / BigInt(RATIO))
          dailyRevenue.addGasToken(e[2] * BigInt(REVENUE_PER_TRADE) / BigInt(RATIO))
        });
        return { dailyFees, dailyRevenue, }
      }) as FetchV2,
      start: '2023-08-09',
    },
  },
  methodology: {
    Fees: "Token trading and launching fees paid by users.",
    Revenue: "All trading fees from users.",
  },
  version: 2,
  pullHourly: true,
} as Adapter