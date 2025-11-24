import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const endOfDay = options.startOfDay + (24 * 60 * 60);
  const url = `https://api.navigator.exchange/sonic/api/daily-fees?from=${options.startOfDay}&to=${endOfDay}`
  const data = await fetchURL(url);

  let fees = 0;
  for (const fee of data) {
    fees += Number(fee.margin) + Number(fee.mint) + Number(fee.burn) + Number(fee.liquidation);
  }

  dailyFees.addUSDValue(fees);
  const dailyHoldersRevenue = dailyFees.clone(0.2);
  const dailyProtocolRevenue = dailyFees.clone(0.8);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyProtocolRevenue, dailyHoldersRevenue };
}

const methodology = {
  Fees: "Trading fees, mint fees, burn fees and liquidation fees",
  Revenue: "Trading fees, mint fees, burn fees and liquidation fees",
  ProtocolRevenue: "Trading fees, mint fees, burn fees and liquidation fees",
  HoldersRevenue: "20% of revenue goes to buybacks",
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SONIC],
  start: '2024-12-22',
  methodology,
}

export default adapter;
