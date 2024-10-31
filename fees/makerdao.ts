import { ETHEREUM } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { DAY } from "../utils/date";

const getDay = (ts:number) => new Date(ts*1000).toISOString().split('T')[0]

async function fetch(_a:any, _b:any, { startTimestamp, endTimestamp, startOfDay }:any) {
  const data = await fetchURL(`https://info-sky.blockanalitica.com/api/v1/revenue/historic/?start_date=${getDay(startTimestamp-3*DAY)}&end_date=${getDay(endTimestamp+3*DAY)}`)

  const dayData = data.find((d:any)=>d.date==getDay(startOfDay))
  const dailyFee = (Number(dayData.stability_fee) + Number(dayData.liquidation_income) + Number(dayData.psm_fees))/365

  // check against https://makerburn.com/#/
  return {
    dailyFees: dailyFee,
    dailyRevenue: dailyFee - Number(dayData.savings_rate_cost)/365,
  };
};


const adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch,
      start: 1573672933,
    },
  }
}

export default adapter;
