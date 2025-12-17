import {FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import axios from "axios";
import {getEnv} from "../../helpers/env";
import {queryAllium} from "../../helpers/allium";

const PRICES_URL = 'https://api.allium.so/api/v1/developer/prices/at-timestamp';
const EUSX_MINT = '3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC';

const fetchSolana: any = async (_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyFees = options.createBalances();


  const yesterdayIso = new Date(options.fromTimestamp * 1000).toISOString();
  const todayIso = new Date(options.toTimestamp * 1000).toISOString();

  const headers = {
    'Content-Type': 'application/json',
    'X-API-KEY': getEnv('ALLIUM_API_KEY')
  };
  if (!headers["X-API-KEY"]) {
    throw new Error("Allium API Key is required[Ignore this error for github bot]")
  }

  // Fetch prices via realtime Developer API
  const priceBody = {
    addresses: [{chain: 'solana', token_address: EUSX_MINT}],
    time_granularity: '1d'
  };

  const priceYesterdayRes = await axios.post(PRICES_URL, {...priceBody, timestamp: yesterdayIso}, {headers})
  const priceTodayRes = await axios.post(PRICES_URL, {...priceBody, timestamp: todayIso}, {headers})


  const priceYesterday = priceYesterdayRes.data.items[0]?.price || 1;
  const priceToday = priceTodayRes.data.items[0]?.price || 1;


  // Fetch supply_yesterday via Query API SQL
  const supplySql = `
      SELECT amount AS supply
      FROM solana.raw.spl_token_total_supply
      WHERE mint = '${EUSX_MINT}'
        AND snapshot_block_timestamp <= TO_TIMESTAMP_NTZ('${options.fromTimestamp}')
      ORDER BY snapshot_block_timestamp DESC LIMIT 1
  `;

  const supplyRes = await queryAllium(supplySql);

  const supplyYesterday = supplyRes[0]?.supply || 0;

  if (supplyYesterday <= 0 || priceYesterday <= 0) {
    return {dailyFees, dailySupplySideRevenue, dailyRevenue};
  }

  const dailyYieldUsd = (priceToday - priceYesterday) * supplyYesterday;

  dailySupplySideRevenue.addUSDValue(dailyYieldUsd);
  dailyFees.addUSDValue(dailyYieldUsd);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-10-01'
    },
  },
  allowNegativeValue: true, // Yield strategies aren't risk-free
  methodology: {
    Fees: 'Yield generated from Solstice various strategies',
    Revenue: 'No protocol revenue (yield fully passed to eUSX holders)',
    SupplySideRevenue: 'Total yield accrued through eUSX price appreciation, distributed to holders',
  }
};
export default adapters;
