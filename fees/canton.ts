import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import fetchURL from "../utils/fetchURL";

const FEE_METRICS: Record<string, { name: string, methodology: string }> = {
  'TRAFFIC_PURCHASE': {
    name: 'Traffic Purchase',
    methodology: 'Canton tokens burned to purchase synchronizer bandwidth.',
  },
  'PREAPPROVAL_BURN': {
    name: 'Preapproval Burn',
    methodology: 'Canton tokens burned to create a standing authorization for receiving CC transfers without being online.',
  },
  'PREAPPROVAL_RENEW_BURN': {
    name: 'Preapproval Renew Burn',
    methodology: 'Canton tokens burned to renew an expiring preapproval before it lapses.',
  },
  'SETUP_BURN': {
    name: 'Setup Burn',
    methodology: 'Canton tokens burned to onboard an external party onto the network.',
  },
  'DUST_EXPIRE': {
    name: 'Dust Expire',
    methodology: 'Near-zero Amulets whose holding fees exceeded their value, garbage-collected by super validators and burned.',
  },
  'HOLDING_FEE': {
    name: 'Holding Fee',
    methodology: 'Per-round fee accrued on Amulet UTXOs, charged upon consumption (zero after CIP-0078, Sep 2025).',
  },
  'SENDER_CHANGE_FEE': {
    name: 'Sender Change Fee',
    methodology: 'Fee for creating the change Amulet sent back to the sender in a transfer (zero after CIP-0078, Sep 2025).',
  },
}

const CANTON_PRICE_API = 'https://fossil-outlook-levitate-gloomy.cantonscan.com/api/mining-rounds/timeseries?interval=day';
const CANTON_ADDED_TO_CG_TOKEN_ON = '2025-11-12';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()

  const query = `
    SELECT
      transfer_type,
      SUM(amount) AS total_fees_for_period
    FROM
      canton.raw.native_token_transfers
    WHERE
      transfer_type IN (${Object.keys(FEE_METRICS).map((metric: string) => `'${metric.toLowerCase()}'`).join(',')})
      AND record_time BETWEEN '${start}' AND '${end}'
    GROUP BY
      transfer_type
  `;

  const queryResult = await queryAllium(query);
  const dailyFees = options.createBalances();

  let cantonPrice = 0;
  if (options.dateString <= CANTON_ADDED_TO_CG_TOKEN_ON) {
    const cantonPriceResponse = await fetchURL(CANTON_PRICE_API);
    const todaysData = cantonPriceResponse.data.find((item: any) => item.date === options.dateString);
    if (!todaysData) {
      throw new Error(`No data found for date ${options.dateString}`);
    }
    cantonPrice = todaysData.avgAmuletPrice;

  }

  for (const item of queryResult) {
    if (cantonPrice > 0) {
      dailyFees.addUSDValue(item.total_fees_for_period * cantonPrice, FEE_METRICS[item.transfer_type.toUpperCase()].name);
    } else {
      dailyFees.addCGToken('canton-network', item.total_fees_for_period, FEE_METRICS[item.transfer_type.toUpperCase()].name);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Includes traffic purchase, preapproval burn, preapproval renew burn, setup burn, dust expire, holding fee, sender change fees",
  Revenue: "All the collected fees (traffic purchase, preapproval burn, preapproval renew burn, setup burn, dust expire, holding fee, sender change fees) are burnt",
  HoldersRevenue: "All the collected fees (traffic purchase, preapproval burn, preapproval renew burn, setup burn, dust expire, holding fee, sender change fees) are burned",
}

const breakdown = Object.fromEntries(Object.keys(FEE_METRICS).map((metric: string) => {
  return [FEE_METRICS[metric].name, FEE_METRICS[metric].methodology];
}));

const breakdownMethodology = {
  Fees: {
    ...breakdown,
  },
  Revenue: {
    ...breakdown,
  },
  HoldersRevenue: {
    ...breakdown,
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  start: "2024-06-26",
  fetch,
  chains: [CHAIN.CANTON],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology,
};

export default adapter;
