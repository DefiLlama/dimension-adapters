import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";
import { getObject } from "../../helpers/sui";

const SWAP_EVENT =
  "0x25929e7f29e0a30eb4e692952ba1b5b65a3a4d65ab5f2a32e1ba3edcb587f26d::pool::Swap";
const FEE_DENOMINATOR = 1_000_000n;

function parsePoolType(type: string): { coinX: string; coinY: string } {
  const start = type.indexOf("<");
  const end = type.lastIndexOf(">");
  if (start === -1 || end === -1)
    throw new Error(`Cannot parse pool type: ${type}`);
  const inner = type.substring(start + 1, end);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "<") depth++;
    else if (inner[i] === ">") depth--;
    else if (inner[i] === "," && depth === 0) {
      return {
        coinX: inner.substring(0, i).trim(),
        coinY: inner.substring(i + 1).trim(),
      };
    }
  }
  throw new Error(`Cannot find type separator in pool type: ${type}`);
}

function toBigInt(value: any): bigint {
  if (value == null || value === "") return 0n;
  const s = String(value);
  const dot = s.indexOf(".");
  const intPart = (dot === -1 ? s : s.slice(0, dot)).replace(/[^\d]/g, "");
  return intPart ? BigInt(intPart) : 0n;
}

type PoolInfo = {
  coinX: string;
  coinY: string;
  swapFeeRate: bigint;
  protocolFeeRate: number;
};

const poolCache: Record<string, PoolInfo> = {};

function parsePool(obj: any): PoolInfo {
  const coins = parsePoolType(obj.type);
  const fields = obj.fields ?? obj;
  return {
    ...coins,
    swapFeeRate: toBigInt(fields.swap_fee_rate),
    protocolFeeRate: Number(fields.protocol_fee_rate ?? 0),
  };
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const query = `
    SELECT
      json_extract_scalar(event_json, '$.pool_id') as pool_id,
      SUM(CASE WHEN json_extract_scalar(event_json, '$.x_for_y') = 'true'
        THEN CAST(json_extract_scalar(event_json, '$.amount_x') AS DECIMAL(38,0))
        ELSE 0 END) as volume_x,
      SUM(CASE WHEN json_extract_scalar(event_json, '$.x_for_y') = 'false'
        THEN CAST(json_extract_scalar(event_json, '$.amount_y') AS DECIMAL(38,0))
        ELSE 0 END) as volume_y
    FROM sui.events
    WHERE event_type = '${SWAP_EVENT}'
      AND date >= from_unixtime(${options.startTimestamp})
      AND date <= from_unixtime(${options.toTimestamp})
      AND timestamp_ms >= ${options.startTimestamp * 1000}
      AND timestamp_ms < ${options.endTimestamp * 1000}
    GROUP BY 1
  `;

  const results: any[] = await queryDuneSql(options, query);
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const newPoolIds = results
    .map((r: any) => r.pool_id)
    .filter((id: string) => id && !poolCache[id]);

  if (newPoolIds.length > 0) {
    const poolResults = await Promise.allSettled(
      newPoolIds.map((id: string) => getObject(id))
    );
    newPoolIds.forEach((id: string, i: number) => {
      const result = poolResults[i];
      if (result.status === "fulfilled" && result.value?.type) {
        try {
          poolCache[id] = parsePool(result.value);
        } catch (e: any) {
          console.error(`[flowx-v3] Failed to parse pool type for ${id}: ${e?.message}`);
        }
      }
    });
  }

  const addSwapFees = (
    token: string,
    volume: bigint,
    swapFeeRate: bigint,
    protocolNibble: number,
  ) => {
    if (volume <= 0n || swapFeeRate <= 0n) return;
    const fees = (volume * swapFeeRate) / FEE_DENOMINATOR;
    if (fees <= 0n) return;
    const protocol = protocolNibble > 0 ? fees / BigInt(protocolNibble) : 0n;
    dailyFees.add(token, fees.toString(), METRIC.SWAP_FEES);
    if (protocol > 0n) dailyRevenue.add(token, protocol.toString(), METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(token, (fees - protocol).toString(), METRIC.LP_FEES);
  };

  for (const row of results) {
    const pool = poolCache[row.pool_id];
    if (!pool) continue;
    const volumeX = toBigInt(row.volume_x);
    const volumeY = toBigInt(row.volume_y);
    if (volumeX > 0n) dailyVolume.add(pool.coinX, volumeX.toString());
    if (volumeY > 0n) dailyVolume.add(pool.coinY, volumeY.toString());
    addSwapFees(pool.coinX, volumeX, pool.swapFeeRate, pool.protocolFeeRate % 16);
    addSwapFees(pool.coinY, volumeY, pool.swapFeeRate, pool.protocolFeeRate >> 4);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  start: "2024-05-10",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Swap fees paid by traders on FlowX CLMM. Computed as input volume × pool swap_fee_rate / 1e6.",
    UserFees: "Same as Fees. Traders pay the pool swap fee on the input token.",
    Revenue: "Protocol share of swap fees. On-chain protocol_fee_rate is a denominator (typically 6), so protocol fees = swap fees / nibble. Only pools with a non-zero protocol fee charge this.",
    ProtocolRevenue: "Protocol share of swap fees. On-chain protocol_fee_rate is a denominator (typically 6), so protocol fees = swap fees / nibble. Only pools with a non-zero protocol fee charge this.",
    SupplySideRevenue: "Swap fees remaining after the protocol cut, accrued to CLMM liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Input-token volume times each pool's swap_fee_rate (millionths, e.g. 3000 = 0.3%).",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "protocol_fee_rate nibble of the input token (X: rate % 16, Y: rate >> 4). Zero when the nibble is 0.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "protocol_fee_rate nibble of the input token (X: rate % 16, Y: rate >> 4). Zero when the nibble is 0.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Swap fees minus the protocol share.",
    },
  },
};

export default adapter;
