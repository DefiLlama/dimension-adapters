import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const matching_engine = '0x3Cb2CBb0CeB96c9456b11DbC7ab73c4848F9a14c';
const order_match_event = 'event OrderMatched(address pair,uint16 orderHistoryId,uint256 id,bool isBid,uint256 price,uint256 total,bool clear,(address sender,address owner,uint256 baseAmount,uint256 quoteAmount,uint256 baseFee,uint256 quoteFee,uint64 tradeId) orderMatch)';
const pair_added_event = `event PairAdded(
  address pair,
  tuple(address token, uint8 decimals, string name, string symbol, uint256 totalSupply) base,
  tuple(address token, uint8 decimals, string name, string symbol, uint256 totalSupply) quote,
  uint256 listingPrice,
  uint256 listingDate,
  string supportedTerminals
)`;

interface IPair {
  address: string;
  base: string;
  quote: string;
  bDecimal: number;
  qDecimal: number;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const pairLogs = await options.getLogs({ target: matching_engine, eventAbi: pair_added_event, onlyArgs: true, fromBlock: 4381503, cacheInCloud: true, })
  const pairs: IPair[] = pairLogs.map((log: any) => {
    return {
      address: log.pair,
      base: log.base,
      quote: log.quote,
      bDecimal: log.bDecimal,
      qDecimal: log.qDecimal
    }
  })
  const logs_order_match = await options.getLogs({ target: matching_engine, eventAbi: order_match_event });

  logs_order_match.forEach((log: any) => {
    const pair: any = pairs.find((pair) => pair.address.toLowerCase() === log.pair.toLowerCase());
    if (pair) {
      // Use baseAmount and quoteAmount directly from the OrderMatch struct
      dailyVolume.add(pair.base.token, log.orderMatch.baseAmount);
      dailyVolume.add(pair.quote.token, log.orderMatch.quoteAmount);
      dailyFees.add(pair.base.token, log.orderMatch.baseFee);
      dailyFees.add(pair.quote.token, log.orderMatch.quoteFee);
    }
  });
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailySupplySideRevenue: 0, }
}

const methodology = {
  Volume: 'This is the total volume of all trades on the exchange.',
  Fees: 'Trading fees paid by users.',
  UserFees: 'Trading fees paid by users.',
  Revenue: 'Fees from users.',
  SupplySideRevenue: 'No supply side revenue. This is a P2P onchain CLOB exchange. Every trade is a match between two users as supplier and taker.',
}


const options: any = { fetch, methodology, start: '2025-08-31' }
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.SOMNIA]: options,
  },
  version: 2,
}

export default adapters;
