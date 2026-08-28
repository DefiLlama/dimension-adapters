import { CHAIN } from "../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";

// p2p.me: a peer-to-peer fiat<->crypto on/off-ramp + payments app on Base and
// Polygon. We report on-ramp volume: the USDC delivered to buyers on completed
// buy orders (orderType 0). On a buy the protocol releases USDC from escrow to the
// buyer in the same transaction, so the value is verifiable 1:1 on chain.
//
// Sell (off-ramp) and pay orders are excluded. Their fiat legs settle off chain
// (the OrderCompleted event moves no USDC), and an on-chain trace of the contract
// confirms the USDC they involve is escrow plumbing: over a 7-day sample 100% of
// USDC inflow is deposits (no order event), and of the USDC outflow buys are ~85%
// while the rest is refunds back to depositors (~10%) plus a ~4% fee/referral tail.
// Counting sells/deposits as volume would double count the same coins that already
// leave as buys. This single-sided, on-chain-settled convention matches the merged
// zkp2p adapter (dexs/zkp2p.ts), the sibling P2P ramp.
//
// Buy orders have migrated across contracts; the Dune sources are time-sequential
// (no overlap), so unioning them does not double count:
//   Polygon  BrokerFactory v1 + v2            (2023 - 2024, retired)
//   Base     OrderProcessor 0xb36c...         (2024-09 -> 2025-05, retired)
//   Base     OrderFlowFacet 0x4cad... struct  (2025-05 -> 2026-03, Dune spellbook)
//   Base     OrderFlowFacet 0x4cad... packed  (2026-03 -> now; the event was
//                                              re-encoded to flat data with a new
//                                              topic, read from raw base.logs)
// Same data source as the existing fees adapter (fees/p2pme/index.ts).

const ORDERFLOW = "0x4cad6eC90e65baBec9335cAd728DDc610c316368";
const ORDERCOMPLETED_TOPIC =
  "0x507539023a7b6a713438d0f44eab4f97bcf8905b183b1108148409a8e8c1ed8c";

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(
    options,
    `
    WITH struct_orders AS (
      SELECT "order" AS od, 'polygon' AS chain FROM p2px_polygon.BrokerFactory_evt_OrderComplete
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT "order", 'polygon' FROM p2px_polygon.BrokerFactoryv2_evt_OrderComplete
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT "_order", 'base' FROM p2p_me_base.OrderProcessor_evt_OrderCompleted
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
      UNION ALL
      -- the spellbook decoder froze at the 2026-03-09 event re-encoding; the raw
      -- leg below takes over there. Hard-partition both at that instant so they
      -- can never overlap even if Dune later backfills this spellbook table.
      SELECT "_order", 'base' FROM p2p_me_base.OrderFlowFacet_evt_OrderCompleted
        WHERE evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
          AND evt_block_time < TIMESTAMP '2026-03-09 11:00:00'
    ),
    struct_buys AS (
      SELECT chain, TRY_CAST(JSON_EXTRACT_SCALAR(od, '$.amount') AS DOUBLE) / 1e6 AS amount
      FROM struct_orders
      WHERE TRY_CAST(JSON_EXTRACT_SCALAR(od, '$.orderType') AS INTEGER) = 0
    ),
    packed_buys AS (
      -- The re-encoded OrderCompleted event packs the order as flat 32-byte words.
      -- Verified offsets (1-indexed for bytearray_substring): amount at byte 65
      -- (word 2, USDC 6-decimals); orderType at byte 449 (word 14; 0=buy,1=sell,2=pay).
      SELECT 'base' AS chain, CAST(bytearray_to_uint256(bytearray_substring(data, 65, 32)) AS DOUBLE) / 1e6 AS amount
      FROM base.logs
      WHERE contract_address = ${ORDERFLOW}
        AND topic0 = ${ORDERCOMPLETED_TOPIC}
        AND CAST(bytearray_to_uint256(bytearray_substring(data, 449, 32)) AS INTEGER) = 0
        AND block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})
        AND block_time >= TIMESTAMP '2026-03-09 11:00:00'
    )
    SELECT chain, SUM(amount) AS volume
    FROM (SELECT chain, amount FROM struct_buys UNION ALL SELECT chain, amount FROM packed_buys)
    WHERE amount IS NOT NULL AND amount > 0
    GROUP BY chain
    `
  );
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const results = options.preFetchedResults || [];
  const row = results.find((r: any) => r.chain === options.chain);
  if (row?.volume) dailyVolume.addUSDValue(row.volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: {
    [CHAIN.POLYGON]: { start: "2023-07-01" },
    [CHAIN.BASE]: { start: "2024-09-01" },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "On-ramp volume: the USDC delivered to buyers on completed p2p.me buy orders (orderType 0), summed from the OrderCompleted events. On a buy the protocol releases USDC from escrow to the buyer in the same transaction, so the value is verifiable 1:1 on chain. Off-ramp (sell) and payment orders are excluded because their fiat legs settle off chain and the on-chain USDC they involve is escrow funding already captured on the buy side, so counting them would double count. Single-sided on-chain-settled convention, matching the merged zkp2p adapter. Sourced from Dune across Polygon (BrokerFactory, retired 2024) and Base (OrderProcessor then OrderFlowFacet).",
  },
};

export default adapter;
