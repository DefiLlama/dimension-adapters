import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const ROUTER = "0x487e905f899ccb6d46fdaec56ba1e0c4cf119862a16c409904b8c78fab1f5e8a";
const CLMM = "0x5c2e5a4d1b355b939ab160c618ed5504a6e1addf109388aa3b83b73b207ab6c7";
const STABLE = "0xa611a8ba7261ed1f4d3afe4ac2166fc9f3180103e3296772d593a1e2720c7405";

// Swap fee is set per pool at creation: CLMM fee over 1e6 (e.g. 0.05%/0.3%), stable over 1e10 (0.01%).
// Protocol takes a uniform 33% cut (PoolMeta.platform_fee_rate); the other 67% goes to veTAPP voters.
// LPs earn TAPP emissions (incentives), not fees, so supply-side revenue is zero.
const PLATFORM_FEE = 0.33;
const DEFAULT_SWAP_FEE = 0.0005; // CLMM standard tier; fallback when no creation event is matched

const fetch = async (options: FetchOptions) => {
  const query = `
    WITH fees AS (
      SELECT pool, fee FROM (
        SELECT json_extract_scalar(data, '$.pool_addr') AS pool,
               TRY_CAST(json_extract_scalar(data, '$.fee') AS DOUBLE)
                 / (CASE WHEN event_type = '${CLMM}::clmm::PoolCreated' THEN 1e6 ELSE 1e10 END) AS fee,
               ROW_NUMBER() OVER (PARTITION BY json_extract_scalar(data, '$.pool_addr') ORDER BY block_time DESC) rn
        FROM aptos.events
        WHERE event_type IN ('${CLMM}::clmm::PoolCreated', '${STABLE}::stable::PoolCreated')
          AND block_time <= from_unixtime(${options.endTimestamp})
      ) WHERE rn = 1
    ),
    swaps AS (
      SELECT json_extract_scalar(data, '$.pool_addr') AS pool,
             element_at(CAST(json_extract(data, '$.assets') AS ARRAY(VARCHAR)),
                        CAST(json_extract_scalar(data, '$.asset_out_index') AS INTEGER) + 1) AS token,
             TRY_CAST(json_extract_scalar(data, '$.amount_out') AS DECIMAL(38,0)) AS amount_out
      FROM aptos.events
      WHERE event_type = '${ROUTER}::router::Swapped' AND TIME_RANGE
    )
    SELECT s.pool, s.token, SUM(s.amount_out) AS amount, MAX(f.fee) AS swap_fee
    FROM swaps s LEFT JOIN fees f ON s.pool = f.pool
    WHERE s.amount_out IS NOT NULL AND s.token IS NOT NULL AND s.pool IS NOT NULL
    GROUP BY 1, 2
  `;
  const rows = await queryDuneSql(options, query);

  // Group volume per pool, carrying each pool's swap fee rate.
  const dailyVolume = options.createBalances();
  const perPool: Record<string, { bal: ReturnType<typeof options.createBalances>; swapFee: number }> = {};
  for (const row of rows) {
    if (!row.token) continue;
    dailyVolume.add(row.token, row.amount);
    const pool = (perPool[row.pool] ??= {
      bal: options.createBalances(),
      swapFee: row.swap_fee != null ? Number(row.swap_fee) : DEFAULT_SWAP_FEE,
    });
    pool.bal.add(row.token, row.amount);
  }

  // Fees = per-pool USD volume * swap fee rate, split 33% treasury / 67% veTAPP voters.
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  await Promise.all(
    Object.values(perPool).map(async ({ bal, swapFee }) => {
      const fees = (await bal.getUSDValue()) * swapFee;
      const protocol = fees * PLATFORM_FEE;
      const holders = fees - protocol;
      dailyFees.addUSDValue(fees, "Swap Fees");
      dailyRevenue.addUSDValue(protocol, "Swap Fees To Treasury");
      dailyRevenue.addUSDValue(holders, "Swap Fees To veTAPP Voters");
      dailyProtocolRevenue.addUSDValue(protocol, "Swap Fees To Treasury");
      dailyHoldersRevenue.addUSDValue(holders, "Swap Fees To veTAPP Voters");
    })
  );

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Sum of the USD value of the output token of every swap.",
  Fees: "Per-pool USD volume multiplied by the pool's swap fee rate.",
  Revenue: "All swap fees: the protocol's platform-fee cut plus the share routed to veTAPP voters.",
  ProtocolRevenue: "Platform fee taken to the protocol treasury.",
  HoldersRevenue: "Remaining swap fees distributed to veTAPP voters via the pool gauges.",
  SupplySideRevenue: "Liquidity providers are rewarded with TAPP emissions (incentives).",
};

const breakdownMethodology = {
  Fees: { "Swap Fees": "Swap fees charged by each pool (per-pool fee rate from its PoolCreated event)." },
  Revenue: {
    "Swap Fees To Treasury": "Protocol platform-fee cut of swap fees (33%).",
    "Swap Fees To veTAPP Voters": "Swap fees routed to veTAPP voters via pool gauges (67%).",
  },
  ProtocolRevenue: {
    "Swap Fees To Treasury": "Platform fee taken to the protocol treasury (33% of swap fees).",
  },
  HoldersRevenue: {
    "Swap Fees To veTAPP Voters": "Swap fees distributed to veTAPP voters via pool gauges (67% of swap fees).",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.APTOS],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: "2025-06-12",
  methodology,
  breakdownMethodology,
};

export default adapter;
