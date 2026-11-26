import { Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import ADDRESSES from "../helpers/coreAssets.json";
import { httpGet } from "../utils/fetchURL";

interface IAuctionsDailyData {
  amount_inj: string;
  amount_stablecoin: string;
  date: string;
  is_auction_day: boolean;
  price_inj: string;
  round: number;
  usd_value: string;
  winner: string;
  winning_bid: string;
}

interface IAuctionsResponse {
  days: IAuctionsDailyData[];
  total_usd_value: number;
  total_auctions: number;
}

const BASE_URL = "https://bigquery-api-636134865280.europe-west1.run.app";


const fetch = async (options: FetchOptions) => {
  const dayStart = options.startOfDay;
  const dayEnd = dayStart + 86400;
  const [gas] = await queryAllium(`
    SELECT
      SUM(CASE WHEN block_timestamp < TO_TIMESTAMP_NTZ(${dayEnd}) THEN fee_amount END) AS gas_fees,
      COUNT_IF(block_timestamp >= TO_TIMESTAMP_NTZ(${dayEnd})) AS txs_after_day
    FROM injective.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${dayStart})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${dayEnd + 900})
      AND fee_denom = '${ADDRESSES.injective.INJ}'
  `);
  if (!gas?.txs_after_day || gas.gas_fees == null) throw new Error(`Allium has not indexed Injective past ${options.dateString} yet`);

  const auctionRes: IAuctionsResponse = await httpGet(`${BASE_URL}/auction?start_date=${options.dateString}`);
  if (auctionRes.days.length !== 1) throw new Error("No data found for the given date: " + options.dateString);

  const dailyFees = options.createBalances()

  dailyFees.add(ADDRESSES.injective.INJ, gas.gas_fees, 'Transaction Fees');
  dailyFees.addUSDValue(auctionRes.total_usd_value, 'Auction Fees');

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

export default {
  methodology: {
    Fees: 'Transaction Fees',
    Revenue: 'Transaction Fees + Auction Fees (INJ burned in auctions)',
    HoldersRevenue: 'Transaction Fees + Auction Fees (INJ burned in auctions)',
  },
  breakdownMethodology: {
    Fees: {
      'Transaction Fees': 'Gas fees paid by users on each transaction, 100% is burned',
      'Auction Fees': 'Exchange fees are auctioned off to the highest bidder for INJ, 100% of auction fees are burned. Auction fees are spread evenly across days in between auctions.',
    },
    Revenue: {
      'Transaction Fees': 'Gas fees paid by users on each transaction, 100% is burned',
      'Auction Fees': 'Exchange fees are auctioned off to the highest bidder for INJ, 100% of auction fees are burned. Auction fees are spread evenly across days in between auctions.',
    },
    HoldersRevenue: {
      'Transaction Fees': 'Gas fees paid by users on each transaction, 100% is burned',
      'Auction Fees': 'Exchange fees are auctioned off to the highest bidder for INJ, 100% of auction fees are burned. Auction fees are spread evenly across days in between auctions.',
    },
  },
  version: 1, // Allium loads Injective in hourly batches ~20 min after each hour, and the auction API is daily
  fetch,
  start: "2021-10-25",
  chains: [CHAIN.INJECTIVE],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

