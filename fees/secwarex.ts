import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const USDT_MINT = "0x55d398326f99059ff775485246999027b3197955";
const SECWAREX_FOUNDATION = "0x34ebddd30ccbd3f1e385b41bdadb30412323e34f";
const SECWAREX_REVENUE_POOL = "0x648d7f4ad39186949e37e9223a152435ab97706c";

const BALANCE_ABI = 'erc20:balanceOf';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const totalFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const totalProtocolRevenue = options.createBalances();
  const [foundationBalanceStart, revenueBalanceStart] = await options.fromApi.multiCall({
    abi: BALANCE_ABI,
    calls: [
        {
            target: USDT_MINT,
            params: [SECWAREX_FOUNDATION]
        },
        {
            target: USDT_MINT,
            params: [SECWAREX_REVENUE_POOL]
        },
    ]
  });
  const [foundationBalanceEnd, revenueBalanceEnd] = await options.toApi.multiCall({
    abi: BALANCE_ABI,
    calls: [
        {
            target: USDT_MINT,
            params: [SECWAREX_FOUNDATION]
        },
        {
            target: USDT_MINT,
            params: [SECWAREX_REVENUE_POOL]
        },
    ]
  });
  const dailyFoundationReceived = BigNumber(foundationBalanceEnd).minus(BigNumber(foundationBalanceStart));
  const dailyRevenueReceived = BigNumber(revenueBalanceEnd).minus(BigNumber(revenueBalanceStart));
  const dailyTotal = dailyFoundationReceived.plus(dailyRevenueReceived).toFixed(0);
  dailyFees.add(USDT_MINT, dailyTotal);
  totalFees.add(USDT_MINT, BigNumber(foundationBalanceEnd).plus(BigNumber(revenueBalanceEnd)).toFixed(0));
  dailyProtocolRevenue.add(USDT_MINT, dailyFoundationReceived.toFixed(0));
  totalProtocolRevenue.add(USDT_MINT, foundationBalanceEnd);
  return { dailyFees, totalFees, dailyProtocolRevenue, totalProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: 36724659,
      meta: {
        methodology: {
            ProtocolRevenue: "Treasury receives 30% of each purchase.",
            Fees: "All fees comes from users for transaction security."
        }
      }
    },
  },
};

export default adapter;
