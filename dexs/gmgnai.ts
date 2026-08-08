import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryDuneSql } from "../helpers/dune";

// Source: Dune GMGN dashboard/query shared with the fees adapter.
type ChainConfig = {
  start: string;
  contract?: string;
  wrappedNative?: string;
  feeAddresses?: string[];
  swapEvent?: string;
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.SOLANA]: {
    start: "2024-03-20",
    feeAddresses: [
      'BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT',
      '7sHXjs1j7sDJGVSMSPjD1b4v3FD6uRSvRWfhRdfv5BiA',
      'HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3',
      'ByRRgnZenY6W2sddo1VJzX9o4sMU4gPDUkcmgrpGBxRy',
      'DXfkEGoo6WFsdL7x6gLZ7r6Hw2S6HrtrAQVPWYx2A1s9',
      '3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK',
      'DymeoWc5WLNiQBaoLuxrxDnDRvLgGZ1QGsEoCAM7Jsrx',
      'dBhdrmwBkRa66XxBuAK4WZeZnsZ6bHeHCCLXa3a8bTJ',
      '6TxjC5wJzuuZgTtnTMipwwULEbMPx5JPW3QwWkdTGnrn',
      'pWTYaVjwCp8YJswrkmJqz2HgpMt7nknejb9uAERoxgS',
      'BiW5ekoFcn13c9p18q9HnHnthQhEPkzBGtW4hrF9esRD',
      'EDMSVKzWZfqknsXEyK59HtwFaBrBtNf3Q3pg3UZNrCtc',
      'Aa9dCLusPbr3xZBjZ7tZNYvWoaikumtFpnnw9dTKNfXu',
      '5L76S2zeHDsGinWpfG7GsiMHmdzgqMkpbQL8SDKRjd74',
      'BL33e7yd7nz1ai5WRonAGjYjmY1y2eWKLBa6iM5uCWts',
      '3XbDVuVs3kSV2GRfsoAEfiYpFS8dXUBfBp57wKcRwNTA',
      '9RiGwqiYsmjjQiv4ouxh3EGmLdPy31wvTrjFu1eQViWC',
      'STUeGc4F7GY9wQxgBxeo2YVH2YbCPesZNeaNVg3HSu7',
      '6rS1bb8pztcE58zJihCzjoNwntMEwHfX4q6Kreu6BEKj',
      '589JbiHZq9kfRVe7oQD5QjFv9XFr8eW34y4W79HFFrQH',
      'BTikXx2NP395SEu3yZREA4ZrVW1c8VqaXViXpqoor22U',
      '6hn8qmhyF6FQmZus56wTY9ZhxHtkZYTq1wFtV8U1Uefs',
      'AZ9VWDRSZh6MYryWk7jzCaA38RabmLXmE2aLRnbuhF9C',
      'HJ7t8ijnd4rJYqJ6faG4oFYwo9vG1b4KsMtWadqSda3A',
      'jKcVtMU6hCPKgbn547cDQUzmFqyjSUPT8sTmw3QGbeA',
      '3gFrSb6J9cEnz5qkeygZYvhWVUcBoJNyHKEURXDZzSvj'
    ],
  },
  [CHAIN.BASE]: {
    start: "2024-06-05",
    contract: "0xd8Ba9D1a99Fc21f0ECA24e9b85737c28A194a4E2",
    wrappedNative: ADDRESSES.base.WETH,
    swapEvent: "event Swap(address indexed payer,address indexed receiver,address indexed feeToken,uint256 amountIn,uint256 amountOut,(uint8 swapType,address tokenIn,address tokenOut,address poolAddress,uint24 fee,int24 tickSpacing,address factoryAddress,bytes path)[] descs)",
  },
  [CHAIN.BSC]: {
    start: "2024-11-27",
    contract: "0x1de460f363AF910f51726DEf188F9004276Bf4bc",
    wrappedNative: ADDRESSES.bsc.WBNB,
    swapEvent: "event Swap(address indexed payer,address indexed receiver,address indexed feeToken,uint256 amountIn,uint256 amountOut,(uint8 swapType,address tokenIn,address tokenOut,address poolAddress,uint24 fee,int24 tickSpacing,address factoryAddress,bytes path, address, bytes32)[] descs)",
  },
  [CHAIN.MONAD]: {
    start: "2025-11-22",
    contract: "0xc9ca80b5ea956aFA98627963D1880033545d108E",
    wrappedNative: ADDRESSES.monad.WMON,
    swapEvent: "event Swap(address indexed payer,address indexed receiver,address indexed feeToken,uint256 amountIn,uint256 amountOut,(uint8 swapType,address tokenIn,address tokenOut,address poolAddress,uint24 fee,int24 tickSpacing,address factoryAddress,bytes path, address, bytes32)[] descs)",
  },
  [CHAIN.HYPERLIQUID]: {
    start: "2026-05-21",
    contract: "0xFCaCD2f51Fc8FA0FE1Ff3e781cE9F97584E62d99",
    wrappedNative: ADDRESSES.hyperliquid.WHYPE,
    swapEvent: "event Swap(address indexed payer,address indexed receiver,address indexed feeToken,uint256 amountIn,uint256 amountOut,(uint8 swapType,address tokenIn,address tokenOut,address poolAddress,uint24 fee,int24 tickSpacing,address factoryAddress,bytes path, address, bytes32)[] descs)",
  },
  [CHAIN.MEGAETH]: {
    start: "2026-05-19",
    contract: "0xB40864738AE17750d802EEa82322873Fe2d2046b",
    wrappedNative: ADDRESSES.megaeth.MEGA,
    swapEvent: "event Swap(address indexed payer,address indexed receiver,address indexed feeToken,uint256 amountIn,uint256 amountOut,(uint8 swapType,address tokenIn,address tokenOut,address poolAddress,uint24 fee,int24 tickSpacing,address factoryAddress,bytes path, address, bytes32)[] descs)",
  },
};

type DuneVolumeRow = {
  daily_volume?: string | number | null;
};

const fetchSolana = async (options: FetchOptions): Promise<FetchResult> => {
  const feeAddresses = chainConfig[CHAIN.SOLANA].feeAddresses!;

  const rows = await (queryDuneSql(options, `
  WITH gmgn_txs AS (
    SELECT DISTINCT
      id AS tx_id
    FROM
      solana.transactions
      CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(account_keys))) AS u(i)
    WHERE
      TIME_RANGE
      AND success = true
      AND account_keys[i] IN (${feeAddresses.map((address) => `'${address}'`).join(", ")})
      AND post_balances[i] > pre_balances[i]
  )
  SELECT
    COALESCE(SUM(amount_usd), 0) AS daily_volume
  FROM
    dex_solana.trades
  WHERE
    TIME_RANGE
    AND trader_id NOT IN (${feeAddresses.map((address) => `'${address}'`).join(", ")})
    AND tx_id IN (SELECT tx_id FROM gmgn_txs)
`) as Promise<DuneVolumeRow[]>);

  return { dailyVolume: Number(rows[0].daily_volume) };
};

// Process one batch of swap logs into the running volume total.
const processSwapLogs = (logs: any[], dailyVolume: any, nativeTokens: Set<string | undefined>) => {
  logs.forEach((log: any) => {
    const firstDesc = log.descs[0];
    const lastDesc = log.descs[log.descs.length - 1];
    const tokenIn = (firstDesc.tokenIn ?? firstDesc[1]).toLowerCase();
    const tokenOut = (lastDesc.tokenOut ?? lastDesc[2]).toLowerCase();

    if (nativeTokens.has(tokenIn)) dailyVolume.addGasToken(log.amountIn);
    else if (nativeTokens.has(tokenOut)) dailyVolume.addGasToken(log.amountOut);
  });
};

const BLOCKS_PER_BATCH = 10000;

const fetchEvm = async (options: FetchOptions): Promise<FetchResult> => {
  const config = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const nativeTokens = new Set([ADDRESSES.null, config.wrappedNative?.toLowerCase()]);

  // Fetch logs in block-range batches and aggregate incrementally instead of
  // pulling the whole day's logs into memory at once. A single getLogs call for
  // the full window OOMs on the high-volume chains; batching bounds peak memory
  // to one batch since each decoded array is released before the next fetch.
  // (streamLogs is not usable here: the indexer cannot decode this event's
  // nested tuple-array `descs`, so it returns empty args.)
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  for (let start = fromBlock; start <= toBlock; start += BLOCKS_PER_BATCH) {
    const end = Math.min(start + BLOCKS_PER_BATCH - 1, toBlock);
    const logs = await options.getLogs({
      target: config.contract,
      eventAbi: config.swapEvent,
      fromBlock: start,
      toBlock: end,
      skipCacheRead: true,
    });
    processSwapLogs(logs, dailyVolume, nativeTokens);
  }

  return { dailyVolume };
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  if (options.chain === CHAIN.SOLANA) {
    // Solana volume comes from Dune, which lags ~a few hours behind head.
    const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
    }
    return await fetchSolana(options);
  }

  return await fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
