import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface BumpinApiResponse {
  dailyVolumeUsd: string;
  dailyFeeUsd: string;
  dailyProtocolRevenueUsd: string;
  dailySupplySideRevenueUsd: string;
}

const fetch = async (options: FetchOptions) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `https://api.bumpin.trade/bapi/statistics?endTimestamp=${timestamp}`;
  
  const response: BumpinApiResponse = await httpGet(url);
  
  // 创建各种费用余额对象
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 总费用
  dailyFees.addUSDValue(Number(response.dailyFeeUsd));
  
  // 协议收入
  dailyProtocolRevenue.addUSDValue(Number(response.dailyProtocolRevenueUsd));
  
  // LP收入
  dailySupplySideRevenue.addUSDValue(Number(response.dailySupplySideRevenueUsd));
  
  // 总收入 = 协议收入 + LP收入
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total fees collected from perpetual trades on Bumpin protocol.",
  UserFees: "All fees paid by users for trading on Bumpin.",
  Revenue: "Total protocol revenue distributed to protocol and liquidity providers.",
  ProtocolRevenue: "Portion of fees going to protocol treasury.",
  SupplySideRevenue: "Portion of fees distributed to liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-01-01',
    },
  },
};

export default adapter;
