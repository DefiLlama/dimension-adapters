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
      "BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT",
      "7sHXjs1j7sDJGVSMSPjD1b4v3FD6uRSvRWfhRdfv5BiA",
      "HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3",
      "ByRRgnZenY6W2sddo1VJzX9o4sMU4gPDUkcmgrpGBxRy",
      "DXfkEGoo6WFsdL7x6gLZ7r6Hw2S6HrtrAQVPWYx2A1s9",
      "3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK",
      "DymeoWc5WLNiQBaoLuxrxDnDRvLgGZ1QGsEoCAM7Jsrx",
      "dBhdrmwBkRa66XxBuAK4WZeZnsZ6bHeHCCLXa3a8bTJ",
      "6TxjC5wJzuuZgTtnTMipwwULEbMPx5JPW3QwWkdTGnrn",
    ],
  },
  [CHAIN.BASE]: {
    start: "2024-07-05",
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

const fetchEvm = async (options: FetchOptions): Promise<FetchResult> => {
  const config = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const nativeTokens = new Set([ADDRESSES.null, config.wrappedNative?.toLowerCase()]);

  const logs = await options.getLogs({
    target: config.contract,
    eventAbi: config.swapEvent,
  });

  logs.forEach((log: any) => {
    const firstDesc = log.descs[0];
    const lastDesc = log.descs[log.descs.length - 1];
    const tokenIn = (firstDesc.tokenIn ?? firstDesc[1]).toLowerCase();
    const tokenOut = (lastDesc.tokenOut ?? lastDesc[2]).toLowerCase();

    if (nativeTokens.has(tokenIn)) dailyVolume.addGasToken(log.amountIn);
    else if (nativeTokens.has(tokenOut)) dailyVolume.addGasToken(log.amountOut);
  });

  return { dailyVolume };
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  return options.chain === CHAIN.SOLANA
    ? await fetchSolana(options)
    : await fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
