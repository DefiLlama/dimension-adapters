import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Both MoveFast deployments. Pools live under the first; the second is an
// earlier package kept alive for the tokens launched on it.
// Current package config (config::treasury, config::treasury_fee_bps, config::pool_fee_bps,
// read 2026-10-16): treasury 0xaaf454d993877e9ed4537e2f6c677a5bcd74df5ae537eaa5c37fb23635f0ffc,
// treasury fee 150 bps, pool fee 0. The earlier package charged 50 bps treasury and 100 bps pool.
// https://explorer.aptoslabs.com/account/0xdef6b8f06dd82104a4bd3957eb715290cc615dc5a4acd432efadd64d23975d34/modules
const PACKAGES = [
  "0xdef6b8f06dd82104a4bd3957eb715290cc615dc5a4acd432efadd64d23975d34",
  "0x8f79b6d87aca62ff5e3e9a555e69e409a3c76b7eb1283249c6998497ef1ac6d7",
];
const eventTypes = (name: string) => PACKAGES.map((address) => `'${address}::pool::${name}'`).join(", ");

const FIRST_LAUNCH = Date.UTC(2026, 9, 12) / 1e3;

const TREASURY_FEES = "Trading Fees To Treasury";
const POOL_FEES_TO_POOL = "Pool Fees To Pool Reserves";
const TAX_TO_HOLDERS = "Token Tax To Token Holders";
const TAX_TO_CREATORS = "Token Tax To Creators";
const TOKEN_TAX = "Token Tax";

type Row = {
  indexed: boolean;
  quote: string | null;
  treasury_fee: string | null;
  pool_fee: string;
  holder_cut: string;
  creator_cut: string;
};

const fetch = async (options: FetchOptions) => {
  const start = options.startTimestamp, end = options.endTimestamp;
  const rows: Row[] = await queryAllium(`
    WITH trades AS (
      SELECT
        data:token::STRING AS token,
        SUM(data:treasury_fee::NUMBER(38, 0)) AS treasury_fee,
        SUM(data:pool_fee::NUMBER(38, 0)) AS pool_fee,
        SUM(data:holder_cut::NUMBER(38, 0)) AS holder_cut,
        SUM(data:creator_cut::NUMBER(38, 0)) AS creator_cut
      FROM aptos.raw.events
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
        AND type IN (${eventTypes("Trade")})
        AND transaction_success = TRUE
      GROUP BY 1
    ),
    quotes AS (
      SELECT data:token::STRING AS token, data:quote::STRING AS quote
      FROM aptos.raw.events
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${FIRST_LAUNCH})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
        AND type IN (${eventTypes("TokenCreated")})
        AND data:token::STRING IN (SELECT token FROM trades)
    ),
    by_quote AS (
      SELECT
        q.quote,
        CAST(SUM(t.treasury_fee) AS VARCHAR) AS treasury_fee,
        CAST(SUM(t.pool_fee) AS VARCHAR) AS pool_fee,
        CAST(SUM(t.holder_cut) AS VARCHAR) AS holder_cut,
        CAST(SUM(t.creator_cut) AS VARCHAR) AS creator_cut
      FROM trades t
      LEFT JOIN quotes q ON q.token = t.token
      GROUP BY 1
    ),
    checks AS (
      -- events past the window are already loaded, so a quiet window is not ingestion lag
      SELECT EXISTS (SELECT 1 FROM aptos.raw.events
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${end}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end + 900})) AS indexed
    )
    -- one row even when the window had no trades, so the check always comes back
    SELECT c.indexed, b.*
    FROM checks c
    LEFT JOIN by_quote b ON TRUE
  `);

  if (!rows?.length) throw new Error("movefast: empty Allium response");
  if (!rows[0].indexed)
    throw new Error(`movefast: Allium has not indexed Aptos past ${new Date(end * 1e3).toISOString()} yet`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of rows) {
    if (row.treasury_fee === null) continue; // the lone check row of a window with no trades
    if (row.quote === null)
      throw new Error("movefast: traded token with no pool::TokenCreated, quote asset unknown");
    // APT is serialized as the fungible-asset address 0xa; price it as the coin.
    const quote = row.quote === "0xa" ? ADDRESSES.aptos.APT : row.quote;

    dailyFees.add(quote, row.treasury_fee, METRIC.TRADING_FEES);
    dailyRevenue.add(quote, row.treasury_fee, TREASURY_FEES);

    // 0 on the current deployment; only the earlier package charged it
    if (row.pool_fee !== "0") {
      dailyFees.add(quote, row.pool_fee, METRIC.LP_FEES);
      dailySupplySideRevenue.add(quote, row.pool_fee, POOL_FEES_TO_POOL);
    }

    dailyFees.add(quote, row.holder_cut, TOKEN_TAX);
    dailySupplySideRevenue.add(quote, row.holder_cut, TAX_TO_HOLDERS);

    dailyFees.add(quote, row.creator_cut, TOKEN_TAX);
    dailySupplySideRevenue.add(quote, row.creator_cut, TAX_TO_CREATORS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.APTOS],
  start: "2026-10-13",
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Fees paid by traders on MoveFast launchpad pools: the platform trading fee, any pool fee, and the token tax each launch's creator sets. The part of the tax that burns the launched token is not included.",
    Revenue: "The platform trading fee on every MoveFast trade (1.5% of the trade), sent to the MoveFast treasury.",
    ProtocolRevenue: "The platform trading fee on every MoveFast trade (1.5% of the trade), sent to the MoveFast treasury.",
    SupplySideRevenue: "The token tax paid out to holders and creators of the launched tokens, plus any pool fee kept in the pool's reserves.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "MoveFast's platform fee, charged on every buy and sell (treasury_fee_bps, 150 bps on the current deployment, 50 bps on the earlier one).",
      [METRIC.LP_FEES]: "Pool fee charged on each trade and kept in the pool's reserves (pool_fee_bps, 0 on the current deployment, 100 bps on the earlier one).",
      [TOKEN_TAX]: "Creator-set tax on each trade, capped at 5%, split on chain between the token's holders, its creator and a burn. Only the holder and creator shares are counted; the burned share is paid in the launched token and is excluded.",
    },
    Revenue: {
      [TREASURY_FEES]: "The platform fee, deposited to the MoveFast treasury on every trade.",
    },
    ProtocolRevenue: {
      [TREASURY_FEES]: "The platform fee, deposited to the MoveFast treasury on every trade.",
    },
    SupplySideRevenue: {
      [POOL_FEES_TO_POOL]: "The pool fee, kept in the pool's reserves.",
      [TAX_TO_HOLDERS]: "The holder share of the token tax, escrowed in the token's rewards vault and paid in the quote asset to that token's holders through Merkle-snapshot epochs. These are holders of the launched token, not of a MoveFast token, so this is a supply-side cost rather than holders revenue.",
      [TAX_TO_CREATORS]: "The creator share of the token tax, claimable by the token's creator.",
    },
  },
};

export default adapter;
