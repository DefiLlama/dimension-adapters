import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { addOneToken } from "../../helpers/prices";
import { base58Encode } from "../../helpers/solana";
import { assertComplete, programEventsSql, u64 } from "../../helpers/alliumSolanaEvents";

const RHIVA_ZAP_PROGRAM = "RH1NLqLxRAUxTq3L1SBS1ED78o1fHxQqRwnBQYVsYub";

const EVENT = {
  SwapCompleted: { discriminator: "5B74D7F5F3C711B4", size: 246 },
  CollectProtocolFee: { discriminator: "CE57114F2D29D53D", size: 162 },
  CollectUserFee: { discriminator: "F8536E6C22B8D86F", size: 226 },
};

export type RhivaTotals = { swaps: { mint0: string; mint1: string; amount0: string; amount1: string }[]; protocolFees: { mint: string; amount: string }[]; userFees: { mint: string; amount: string }[] };

export async function fetchRhivaTotals(options: FetchOptions): Promise<RhivaTotals> {
  const rows = await queryAllium(`${programEventsSql(RHIVA_ZAP_PROGRAM, options)},
  totals AS (
    -- SwapCompletedEvent: mint0 @8 | mint1 @40 | from @72 | amount0 u64 @104 | amount1 u64 @112 (mint0 is sold for mint1)
    SELECT 'swap' AS kind, SUBSTR(data, 17, 64) AS mint0, SUBSTR(data, 81, 64) AS mint1,
      SUM(${u64("data", 104)})::VARCHAR AS amount0, SUM(${u64("data", 112)})::VARCHAR AS amount1
    FROM program_events WHERE STARTSWITH(data, '${EVENT.SwapCompleted.discriminator}')
    GROUP BY 2, 3
    UNION ALL
    -- CollectProtocolFeeEvent: mint @8 | from @40 | amount u64 @72
    SELECT 'protocol_fee', SUBSTR(data, 17, 64), NULL, SUM(${u64("data", 72)})::VARCHAR, NULL
    FROM program_events WHERE STARTSWITH(data, '${EVENT.CollectProtocolFee.discriminator}')
    GROUP BY 2
    UNION ALL
    -- CollectUserFeeEvent: mint @8 | from @40 | to @72 | amount u64 @104
    SELECT 'user_fee', SUBSTR(data, 17, 64), NULL, SUM(${u64("data", 104)})::VARCHAR, NULL
    FROM program_events WHERE STARTSWITH(data, '${EVENT.CollectUserFee.discriminator}')
    GROUP BY 2
  ),
  checked AS (
    SELECT checks.*,
      (SELECT COUNT(*) FROM program_events
        WHERE ${Object.values(EVENT).map(({ discriminator, size }) => `(STARTSWITH(data, '${discriminator}') AND LENGTH(data) != ${size})`).join(" OR ")}) AS misread_events
    FROM checks
  )
  SELECT checked.*, totals.*
  FROM checked
  LEFT JOIN totals ON TRUE`);
  const [row] = rows;
  assertComplete(row, "rhiva", options);
  if (Number(row.misread_events) > 0)
    throw new Error(`rhiva: ${row.misread_events} zap events have a size the adapter does not decode, the event layout changed`);

  const mint = (hex: string) => base58Encode(Buffer.from(hex, "hex"));
  const totals: RhivaTotals = { swaps: [], protocolFees: [], userFees: [] };
  for (const { kind, mint0, mint1, amount0, amount1 } of rows) {
    if (kind === "swap") totals.swaps.push({ mint0: mint(mint0), mint1: mint(mint1), amount0, amount1 });
    if (kind === "protocol_fee") totals.protocolFees.push({ mint: mint(mint0), amount: amount0 });
    if (kind === "user_fee") totals.userFees.push({ mint: mint(mint0), amount: amount0 });
  }
  return totals;
}

const fetch = async (options: FetchOptions) => {
  const { swaps } = await fetchRhivaTotals(options);
  const dailyVolume = options.createBalances();
  for (const { mint0, mint1, amount0, amount1 } of swaps)
    addOneToken({ balances: dailyVolume, token0: mint0, amount0, token1: mint1, amount1 });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-10",
  dependencies: [Dependencies.ALLIUM],
  // the zap swaps are routed through Jupiter to Solana DEXs that are tracked on their own
  doublecounted: true,
  methodology: {
    Volume: "The SOL side of every swap made through Rhiva's zap program, which routes the swaps through Jupiter to other Solana DEXs.",
  },
};

export default adapter;
