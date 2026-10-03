import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';
import { CHAIN } from './chains';

export const fetchPolymarketBuilderVolume = async ({ options, builder, builderCode }: { options: FetchOptions, builder: string, builderCode?: string }) => {

  const data = await fetchURL('https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY')
  const dateString = (new Date(options.startOfDay * 1000).toISOString()).replace('.000Z', 'Z' )
  const volume = data.find((item: any) => item.dt === dateString && item.builder === builder)

  if (!volume) {
    throw new Error(`No volume data found for ${builder} on ${dateString}`);
  }

  const result: FetchResult = { dailyNotionalVolume: volume.volume };

  // USD (cash) volume: sum sizeUsdc across the builder's attributed trades,
  // paging the same CLOB endpoint used by fetchPolymarketV2BuilderFees below.
  if (builderCode) {
    const dailyVolume = options.createBalances();
    let cursor: string | undefined;
    do {
      const url = `https://clob.polymarket.com/builder/trades?builder_code=${builderCode}&after=${options.startTimestamp}&before=${options.endTimestamp}${cursor ? `&next_cursor=${cursor}` : ''}`;
      const tradesData = await fetchURL(url);
      for (const trade of tradesData.data) {
        dailyVolume.addUSDValue(Number(trade.sizeUsdc || 0));
      }
      cursor = tradesData.next_cursor;
      await sleep(500);
    } while (cursor && cursor !== 'LTE=');
    result.dailyVolume = dailyVolume;
  }

  return result;
};


export function polymarketBuilderExports({ builder, start, builderCode }: { builder: string, start: string, builderCode?: string }) {

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

  let cursor: string | undefined;
  do {
    const url = `https://clob.polymarket.com/builder/trades?builder_code=${builderCode}&after=${options.startTimestamp}&before=${options.endTimestamp}${cursor ? `&next_cursor=${cursor}` : ''}`;
    const tradesData = await fetchURL(url);
    for (const trade of tradesData.data) {
      dailyFees.addUSDValue(Number(trade.builderFee || 0), 'Polymarket Builder Fees');
    }
    cursor = tradesData.next_cursor;
    await sleep(500);
  } while (cursor && cursor !== 'LTE=');

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

export function polymarketV2BuilderFeesExports({ builderCode, builderName, start }: { builderCode: string, builderName: string, start: string }) {
  const fetch = async (options: FetchOptions) => {
    return await fetchPolymarketV2BuilderFees({ options, builderCode });
  }

  const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.POLYGON],
    fetch,
    start,
    doublecounted: true,
    methodology: {
      Fees: `Builder fees received by ${builderName} from trades on Polymarket v2`,
      Revenue: `Builder fees received by ${builderName} from trades on Polymarket v2`,
      ProtocolRevenue: `Builder fees received by ${builderName} from trades on Polymarket v2`,
    },
    breakdownMethodology: {
      Fees: {
        'Polymarket Builder Fees': `Builder fees received by ${builderName} from trades on Polymarket v2`,
      },
      Revenue: {
        'Polymarket Builder Fees': `Builder fees received by ${builderName} from trades on Polymarket v2`,
      },
      ProtocolRevenue: {
        'Polymarket Builder Fees': `Builder fees received by ${builderName} from trades on Polymarket v2`,
      },
    }
  }

  return adapter;
}

interface GetPolymarketVolumeProps {
  options: FetchOptions;
  exchanges: Array<string>;
  currency: string;
}

type PolymarketOrderSide = 'BUY' | 'SELL';

const ORDER_FILLED_EVENT = 'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)';

const getLogArgs = (log: any) => log.args ?? log;

const getLogIndex = (log: any) => {
  const value = Number(log.logIndex ?? log.log_index ?? log.index);
  if (!Number.isFinite(value)) throw new Error('Polymarket log is missing logIndex');
  return value;
};

const getLogTransactionHash = (log: any) => {
  const value = String(log.transactionHash ?? log.transaction_hash ?? log.txHash ?? '').toLowerCase();
  if (!value) throw new Error('Polymarket log is missing transactionHash');
  return value;
};

const getLogAddress = (log: any) => {
  const value = String(log.address ?? log.contractAddress ?? log.contract_address ?? '').toLowerCase();
  if (!value) throw new Error('Polymarket log is missing contract address');
  return value;
};

const getOrderSide = (log: any): PolymarketOrderSide => {
  const args = getLogArgs(log);
  const makerAssetId = BigInt(args.makerAssetId);
  const takerAssetId = BigInt(args.takerAssetId);

  if (makerAssetId === 0n && takerAssetId !== 0n) return 'BUY';
  if (makerAssetId !== 0n && takerAssetId === 0n) return 'SELL';

  throw new Error(`Unable to derive Polymarket order side for ${String(args.orderHash ?? 'unknown order')}`);
};

const getCashAmount = (log: any) => {
  const args = getLogArgs(log);
  return getOrderSide(log) === 'BUY'
    ? BigInt(args.makerAmountFilled)
    : BigInt(args.takerAmountFilled);
};

const getTokenAmount = (log: any) => {
  const args = getLogArgs(log);
  return getOrderSide(log) === 'BUY'
    ? BigInt(args.takerAmountFilled)
    : BigInt(args.makerAmountFilled);
};

const getFillTaker = (log: any) => {
  const value = String(getLogArgs(log).taker ?? '').toLowerCase();
  if (!value) throw new Error('Polymarket OrderFilled log is missing taker');
  return value;
};

const getFillMaker = (log: any) => {
  const value = String(getLogArgs(log).maker ?? '').toLowerCase();
  if (!value) throw new Error('Polymarket OrderFilled log is missing maker');
  return value;
};

export async function getPolymarketVolume(props: GetPolymarketVolumeProps): Promise<FetchResult> {
  const { options, exchanges, currency } = props;

  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();

  const orderFilledLogs = await options.getLogs({
    targets: exchanges,
    eventAbi: ORDER_FILLED_EVENT,
    flatten: true,
    entireLog: true,
    parseLog: true,
  });

  const groups = new Map<string, any[]>();

  const getGroup = (log: any) => {
    const key = `${getLogTransactionHash(log)}:${getLogAddress(log)}`;
    let group = groups.get(key);

    if (!group) {
      group = [];
      groups.set(key, group);
    }

    return group;
  };

  const seenLogs = new Set<string>();

  for (const log of orderFilledLogs) {
    const key = `${getLogTransactionHash(log)}:${getLogAddress(log)}:${getLogIndex(log)}`;
    if (seenLogs.has(key)) continue;

    seenLogs.add(key);
    getGroup(log).push(log);
  }

  for (const fills of groups.values()) {
    fills.sort((a, b) => getLogIndex(a) - getLogIndex(b));

    const assigned = new Set<any>();
    const terminalFills = fills.filter((fill) => getFillTaker(fill) === getLogAddress(fill));
    let previousTerminalIndex = -1;

    for (const terminalFill of terminalFills) {
      const terminalIndex = getLogIndex(terminalFill);
      const terminalMaker = getFillMaker(terminalFill);
      const takerSide = getOrderSide(terminalFill);

      const makerFills = fills.filter((fill) => {
        const index = getLogIndex(fill);

        return (
          !assigned.has(fill)
          && index > previousTerminalIndex
          && index < terminalIndex
          && getFillTaker(fill) === terminalMaker
        );
      });

      if (!makerFills.length) {
        throw new Error(
          `Polymarket matched batch has no maker fills before terminal log ${terminalIndex}`
        );
      }

      assigned.add(terminalFill);

      for (const fill of makerFills) {
        const makerSide = getOrderSide(fill);
        const tokenAmount = getTokenAmount(fill);
        const volumeAmount = makerSide === takerSide ? tokenAmount : getCashAmount(fill);

        dailyVolume.add(currency, volumeAmount);
        dailyNotionalVolume.add(currency, tokenAmount);
        assigned.add(fill);
      }

      previousTerminalIndex = terminalIndex;
    }

    for (const fill of fills) {
      if (assigned.has(fill)) continue;

      dailyVolume.add(currency, getCashAmount(fill) / 2n);
      dailyNotionalVolume.add(currency, getTokenAmount(fill) / 2n);
    }
  }

  return { dailyVolume, dailyNotionalVolume };
}

export default polymarketBuilderExports;