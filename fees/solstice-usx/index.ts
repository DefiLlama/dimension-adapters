import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import { getEnv } from "../../helpers/env";
import { queryAllium } from "../../helpers/allium";
import { getPrices } from "../../utils/prices";

const PRICES_URL = 'https://api.allium.so/api/v1/developer/prices/at-timestamp';
const EUSX_MINT = '3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC';

const fetchEusxPrice = async (timestamp: number): Promise<number> => {
  const res = await getPrices([`solana:${EUSX_MINT}`], timestamp)
  const price = res[`solana:${EUSX_MINT}`]?.price
  if (price) {
    return price
  }
  // missing price on defillama api, use Allium as backup
  const headers = {
    'Content-Type': 'application/json',
    'X-API-KEY': getEnv('ALLIUM_API_KEY')
  };
  if (!headers["X-API-KEY"]) {
    throw new Error("Allium API Key is required[Ignore this error for github bot]")
  }
  const priceBody = {
    addresses: [{ chain: 'solana', token_address: EUSX_MINT }],
    time_granularity: '1d'
  };

  const timeIso = new Date(timestamp * 1000).toISOString();
  const resAllium = await axios.post(PRICES_URL, { ...priceBody, timestamp: timeIso }, { headers })
  const priceAllium = resAllium.data.items[0]?.price;
  if (priceAllium) {
    return priceAllium
  }
  throw new Error(`Could not fetch price for token ${EUSX_MINT} on timestamp ${timestamp}`)
}

const fetch: any = async (_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [priceYesterday, priceToday] = await Promise.all([fetchEusxPrice(options.fromTimestamp), fetchEusxPrice(options.toTimestamp)])

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
  console.log('supplyYesterday', supplyYesterday);
  console.log('priceYesterday', priceYesterday);
  console.log('priceToday', priceToday);

  if (supplyYesterday <= 0 || priceYesterday <= 0) {
    return { dailyFees, dailySupplySideRevenue, dailyRevenue };
  }

  const dailyYieldUsd = (priceToday - priceYesterday) * supplyYesterday;

  dailySupplySideRevenue.addUSDValue(dailyYieldUsd);
  dailyFees.addUSDValue(dailyYieldUsd);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-04',
  dependencies: [Dependencies.ALLIUM],
  allowNegativeValue: true, // Yield strategies aren't risk-free
  methodology: {
    Fees: 'Yield generated from Solstice various strategies',
    Revenue: 'No protocol revenue (yield fully passed to eUSX holders)',
    SupplySideRevenue: 'Total yield accrued through eUSX price appreciation, distributed to holders',
  }
};

export default adapters;
