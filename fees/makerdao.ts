/*
Data sources:
- https://info.sky.money/revenue
- https://info.sky.money/buyback

check against:
- https://makerburn.com/#/
*/

import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { DAY } from "../utils/date";
import { FetchOptions } from "../adapters/types";

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetch(_a: any, _b: any, options: FetchOptions) {

  const revenue_data = await fetchURL(`https://info-sky.blockanalitica.com/api/v1/revenue/historic/?start_date=${getDay(options.startTimestamp - 3 * DAY)}&end_date=${getDay(options.endTimestamp + 3 * DAY)}`)
  const buyback_data = await fetchURL(`https://info-sky.blockanalitica.com/buyback/historic/?days_ago=9999&format=json`)

  const dayData = revenue_data.find((d: any) => d.date == getDay(options.startOfDay))
  const buybackDayData = buyback_data.bar.find((d: any) => d.date == getDay(options.startOfDay))

  const dailyFees = (Number(dayData.stability_fee) + Number(dayData.liquidation_income) + Number(dayData.psm_fees)) / 365
  const dailyRevenue = Number(dayData.total_net_revenue) / 365

  const dhr = options.createBalances();
  const dpr = options.createBalances();

  if (buybackDayData) {
    dhr.addCGToken('sky', Number(buybackDayData.sky_buyback_24h))
  }
  dpr.addUSDValue(Number(dailyRevenue))
  dpr.subtract(dhr)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dhr,
    dailyProtocolRevenue: dpr,
  };
};


const adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2019-11-13',
      meta: {
        methodology: {
          Fees: "Stability fees charged on DAI loans, liquidation income from collateral auctions, and PSM (Peg Stability Module) fees from USDC/DAI conversions",
          Revenue: "Fees collected minus savings rate paid to DSR depositors and operational expenses",
          HoldersRevenue: "SKY token buybacks",
          ProtocolRevenue: "Net protocol revenue after subtracting SKY token buybacks"
        }
      }
    },
  },
  allowNegativeValues: true, // Expenses can be higher than Daily Fees
}

export default adapter;
