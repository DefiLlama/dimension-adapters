import { FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface IFeesDailyData {
  exchange_fees_usd: number;
  gas_fees_usd: number;
  total_fees_usd: number;
}

interface IFeesResponse {
  days: IFeesDailyData[];
  exchange_fees_usd: number;
  gas_fees: number;
  total_fees_usd: number;
}

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


const fetch = async (_: number, _t: any, options: FetchOptions) => {
  const feesRes: IFeesResponse = await httpGet(`${BASE_URL}/fees?start_date=${options.dateString}`);
  const auctionRes: IAuctionsResponse = await httpGet(`${BASE_URL}/auction?start_date=${options.dateString}`);
  if (feesRes.days.length !== 1 || auctionRes.days.length !== 1) throw new Error("No data found for the given date: " + options.dateString);

  const dailyFees = options.createBalances()

  dailyFees.addUSDValue(feesRes.total_fees_usd, 'Transaction Fees');
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
  fetch,
  start: "2021-07-16",
  chains: [CHAIN.INJECTIVE],
  protocolType: ProtocolType.CHAIN,
};

