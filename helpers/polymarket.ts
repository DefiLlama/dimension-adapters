import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';
import { CHAIN } from './chains';

const BUILDER_TRADES_URL = 'https://clob.polymarket.com/builder/trades'

const CLOB_V2_START = '2026-04-28'

async function getBuilderTrades(builderCode: string, fromTimestamp: number, toTimestamp: number) {
  const trades: any[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const url = `${BUILDER_TRADES_URL}?builder_code=${builderCode}&before=${toTimestamp}${cursor ? `&next_cursor=${cursor}` : ''}`
    const { data, next_cursor } = await fetchURL(url)
    for (const trade of data) {
      const matchTime = Number(trade.matchTime)
      if (matchTime < fromTimestamp || matchTime >= toTimestamp || seen.has(trade.id)) continue
      seen.add(trade.id)
      trades.push(trade)
    }
    const oldest = data[data.length - 1]
    if (!oldest || Date.parse(oldest.createdAt) / 1e3 < fromTimestamp - 60) break
    cursor = next_cursor
    await sleep(500)
  } while (cursor && cursor !== 'LTE=')
  return trades
}

/**
 * Daily volume of one Polymarket builder for the day that starts at `options.startOfDay` (UTC), from the builder's
 * attributed CLOB trades that day: `dailyNotionalVolume` as the sum of `size` (shares) and `dailyVolume` as the sum of
 * `sizeUsdc`. A day with no trades is 0.
 *
 * Summed `size` matches the daily volume of https://data-api.polymarket.com/v2/builders/volume on complete days, but
 * that API publishes a day only ~1-2 days late, its newest bucket is still filling, it has no row for a builder with
 * no volume that day, and it serves only the latest 90 days.
 *
 * Days before CLOB v2 throw, so refills never overwrite the history stored from the Data API.
 */
export const fetchPolymarketBuilderVolume = async ({ options, builder, builderCode }: { options: FetchOptions, builder: string, builderCode: string }) => {
  const dateString = new Date(options.startOfDay * 1000).toISOString().slice(0, 10)
  if (dateString < CLOB_V2_START) {
    throw new Error(`Polymarket builder trades are only available from ${CLOB_V2_START}, cannot fetch ${builder} on ${dateString}`);
  }

  const dailyVolume = options.createBalances();
  let dailyNotionalVolume = 0;
  const trades = await getBuilderTrades(builderCode, options.startTimestamp, options.endTimestamp);
  for (const trade of trades) {
    dailyVolume.addUSDValue(Number(trade.sizeUsdc || 0));
    dailyNotionalVolume += Number(trade.size || 0);
  }
  return { dailyVolume, dailyNotionalVolume };
};


export function polymarketBuilderExports({ builder, start, builderCode }: { builder: string, start: string, builderCode: string }) {

  const fetch = async (options: FetchOptions) => {
    return await fetchPolymarketBuilderVolume({ options, builder, builderCode });
  }

  const adapter: SimpleAdapter = {
    version: 1,
    chains: [CHAIN.POLYGON],
    fetch,
    doublecounted: true,
    start,
  }

  return adapter as SimpleAdapter
}

export async function fetchPolymarketV2BuilderFees({ options, builderCode }: { options: FetchOptions, builderCode: string }) {
  const dailyFees = options.createBalances();

  const trades = await getBuilderTrades(builderCode, options.startTimestamp, options.endTimestamp);
  for (const trade of trades) {
    dailyFees.addUSDValue(Number(trade.builderFee || 0), 'Polymarket Builder Fees');
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

// revenueToHolders: all builder fees go to the builder's token holders.
// holdersRevenueRatio: only that share goes to token holders (e.g. 0.75), the builder keeps the rest.
// supplySideRevenueRatio: that share goes to the builder's market provider (e.g. 0.25), the builder keeps the rest.
export function polymarketV2BuilderFeesExports({ builderCode, builderName, start, revenueToHolders, holdersRevenueRatio, supplySideRevenueRatio }: { builderCode: string, builderName: string, start: string, revenueToHolders?: boolean, holdersRevenueRatio?: number, supplySideRevenueRatio?: number }) {
  const holdersRatio = revenueToHolders ? 1 : holdersRevenueRatio ?? 0;
  const supplySideRatio = supplySideRevenueRatio ?? 0;
  const percent = (ratio: number) => `${Math.round(ratio * 10000) / 100}%`;
  const feesText = supplySideRatio ? `Builder fees charged by ${builderName} on trades on Polymarket v2` : `Builder fees received by ${builderName} from trades on Polymarket v2`;
  const revenueText = supplySideRatio ? `${percent(1 - supplySideRatio)} of builder fees from trades on Polymarket v2, kept by ${builderName}` : feesText;
  const supplySideText = `${percent(supplySideRatio)} of builder fees from trades on Polymarket v2, paid on to ${builderName}'s market provider`;
  const protocolRevenueText = holdersRatio === 0 ? revenueText
    : holdersRatio === 1 ? `No builder fees are kept by ${builderName}`
    : `${percent(1 - holdersRatio)} of builder fees received by ${builderName}, kept by ${builderName}`;
  const holdersRevenueText = holdersRatio === 1 ? `Builder fees received by ${builderName}, all distributed to its token holders`
    : `${percent(holdersRatio)} of builder fees received by ${builderName}, distributed to its token holders`;

  const fetch = async (options: FetchOptions) => {
    const res = await fetchPolymarketV2BuilderFees({ options, builderCode });
    if (supplySideRatio) {
      const dailyRevenue = res.dailyFees.clone(1 - supplySideRatio);
      return { dailyFees: res.dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue: res.dailyFees.clone(supplySideRatio, 'Polymarket Builder Fees To Provider') };
    }
    if (!holdersRatio) return res;
    const dailyProtocolRevenue = holdersRatio === 1 ? options.createBalances() : res.dailyFees.clone(1 - holdersRatio);
    return { dailyFees: res.dailyFees, dailyRevenue: res.dailyFees, dailyProtocolRevenue, dailyHoldersRevenue: res.dailyFees.clone(holdersRatio) };
  }

  const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.POLYGON],
    fetch,
    start,
    doublecounted: true,
    methodology: {
      Fees: feesText,
      Revenue: revenueText,
      ProtocolRevenue: protocolRevenueText,
      ...(holdersRatio ? { HoldersRevenue: holdersRevenueText } : {}),
      ...(supplySideRatio ? { SupplySideRevenue: supplySideText } : {}),
    },
    breakdownMethodology: {
      Fees: {
        'Polymarket Builder Fees': feesText,
      },
      Revenue: {
        'Polymarket Builder Fees': revenueText,
      },
      ...(holdersRatio < 1 ? { ProtocolRevenue: { 'Polymarket Builder Fees': protocolRevenueText } } : {}),
      ...(holdersRatio ? { HoldersRevenue: { 'Polymarket Builder Fees': holdersRevenueText } } : {}),
      ...(supplySideRatio ? { SupplySideRevenue: { 'Polymarket Builder Fees To Provider': supplySideText } } : {}),
    }
  }

  return adapter;
}

interface GetPolymarketVolumeProps {
  options: FetchOptions;
  exchanges: Array<string>;
  currency: string;
}

export async function getPolymarketVolume(props: GetPolymarketVolumeProps): Promise<FetchResult> {
  const { options, exchanges, currency } = props;
  
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  
  const OrderFilledLogs = await options.getLogs({
    targets: exchanges,
    eventAbi: 'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)',
    flatten: true,
  });

  for (const log of OrderFilledLogs) {
    if (log.makerAssetId.toString() === '0') {
      dailyVolume.add(currency, BigInt(log.makerAmountFilled) / 2n);
      dailyNotionalVolume.add(currency, BigInt(log.takerAmountFilled) / 2n);
    }
    else if (log.takerAssetId.toString() === '0') {
      dailyVolume.add(currency, BigInt(log.takerAmountFilled) / 2n);
      dailyNotionalVolume.add(currency, BigInt(log.makerAmountFilled) / 2n)
    }
  }

  return { dailyVolume, dailyNotionalVolume };
}


export default polymarketBuilderExports;