import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

type DuneVolumeRow = {
  daily_volume?: string | number | null;
};

const chainConfig: Record<string, { start: string; contractAddresses?: string[]; duneChain?: string }> = {
  [CHAIN.SOLANA]: {
    start: "2024-10-01",
  },
  [CHAIN.BASE]: {
    start: "2024-12-12",
    duneChain: "base",
    contractAddresses: [
      "0xb1000058c87d843fc0154591ff9d72af5e7213d5",
      "0xaa82714222d11919b0fb07b9cf938f3080748b0a",
      "0xc6ad39388bad9f197ad2842e6cdbc4bf7f3d5cc4",
      "0x284808b823e61a399fec52e1ba71d9afb1905150",
      "0x2e8759e33116b0f101390ddd3d8ce9f6b0817db2",
      "0x5ee5635f02a43f21085f69fa68c1325393a6d7fb",
      "0xa9a05f046163224e81770c7d29fc98392064eb96",
      "0x3daa9624e217c854ba10905d639e4d0c5958f4bd",
      "0x3964dfb31fc89e2616f7553ae02649c4058350eb",
      "0x6e0ee964f2afe05eeb72512f06ffb741ce7ebd86",
      "0x95b14c6015084c766b2daa2ba3ead4c528781d29",
      "0x28356428e67263d231293a8326bf362d2e840936",
      "0xdb25696c6db64f1fda5d0528cd9e2ee7fbe2c466",
      "0xdd93c422bcc8b363e2510ef01030050d845b0fd5",
      "0x5e504b55646d9c103bbccc5831230cfbfa6314f4",
      "0x3156cc687073313a7a021fefc90fdb63e3ec1e27",
      "0x20de462708a2f53ed0ca7d3718d4278c38752e12",
      "0x2ae980b825acdbc2faf7b594f8a59a83750e3531",
      "0x1413e2f212eb6cf072dcd71cb7a26b2a63819c53",
      "0x4061a31d8c03a12598127966e301bae3bdccff40",
    ],
  },
  [CHAIN.BSC]: {
    start: "2025-02-13",
    duneChain: "bnb",
    contractAddresses: [
      "0xb1000058c87d843fc0154591ff9d72af5e7213d5",
      "0x8f2d511be49919722358d3217a0775e54b1368fb",
      "0x3b95a6b1f890ae2f6862ac5be37f27c3b542112b",
      "0x8f73798b3ee029dfbafca96d015fbf6bfe8d1fc7",
      "0xaf1ab69d1675db5aeba18000590fd64858f37fb4",
      "0x554d8519e93474955e69d467dbac50f2fed186c4",
      "0xb0b2fb0e2852ec94d8bee3b2a42e02b16ddd5b62",
      "0xb5f1f0413d9965c484cf7d2df2a329798dc34616",
      "0x0ba81c91fe41301b760b44285cc2fd034619015a",
      "0xd4f1afd0331255e848c119ca39143d41144f7cb3",
      "0x015ae929e9a74fb739267553b6fd7ea9d2a318af",
    ],
  },
};

const fetchSolana = (options: FetchOptions) => queryDuneSql(options, `
  SELECT
    COALESCE(SUM(amount_usd), 0) AS daily_volume
  FROM
    bloom_solana.bot_trades
  WHERE
    TIME_RANGE
    AND is_last_trade_in_transaction = true
`) as Promise<DuneVolumeRow[]>;

const fetchEvm = (options: FetchOptions, config: { start: string; contractAddresses?: string[]; duneChain?: string }) => {
  return queryDuneSql(options, `
    WITH bot_trades AS (
      SELECT
        trades.tx_hash,
        trades.evt_index,
        trades.amount_usd
      FROM
        dex.trades
      WHERE
        trades.blockchain = '${config.duneChain}'
        AND trades.tx_to IN (${config.contractAddresses?.join(", ")})
        AND TIME_RANGE
    ),
    last_trades AS (
      SELECT
        tx_hash,
        MAX(evt_index) AS evt_index
      FROM
        bot_trades
      GROUP BY
        tx_hash
    )
    SELECT
      COALESCE(SUM(bot_trades.amount_usd), 0) AS daily_volume
    FROM
      bot_trades
      JOIN last_trades USING (tx_hash, evt_index)
  `) as Promise<DuneVolumeRow[]>;
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  const now = Date.now();
  const tenHoursAgo = now - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const rows = options.chain === CHAIN.SOLANA ? await fetchSolana(options) : await fetchEvm(options, config);
  const [row] = rows;
  dailyVolume.addUSDValue(Number(row.daily_volume));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  doublecounted: true,
  isExpensiveAdapter: true,
};

export default adapter;
