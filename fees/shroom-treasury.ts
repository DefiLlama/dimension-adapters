import { Interface, ZeroAddress } from "ethers";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { queryAllium } from "../helpers/allium";

// Robinhood deployment, also used by dexs/uniswap-v4.ts.
// https://robinhoodchain.blockscout.com/address/0x8366a39cc670b4001a1121b8f6a443a643e40951
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
const SHROOM = "0xab093def657f15df31b33922a95e047add645b29";
const GENESIS_POOL = "0xbacecf788d2279f65da62d7bf69f4de28580a88bec56847c8d2ba6fbdd73f6eb";
// Treasury ownership confirmed by the team; never infer it from shared Pons infrastructure.
const TREASURY = [
  "0xad5bc794c2829e671a7f5c135ca85ff97a62638b",
  "0xfca196eacf630f67b505023c4f2cf7eb36da2f9f",
];
// MU dividend payer and token verified in SHROOM_DIMENSION_HANDOFF.md; both
// are shared infrastructure. Only transfers into the confirmed treasury count.
// https://robinhoodchain.blockscout.com/address/0xEa4036B0FccDB5F90421D5b9c35E05758e40Ce18
const DISTRIBUTOR = "0xea4036b0fccdb5f90421d5b9c35e05758e40ce18";
const MU = "0xff080c8ce2e5feadaca0da81314ae59d232d4afd";

const LP_REVENUE = "LP Fees To Treasury";
const DIVIDENDS = "MU Dividends";
const DIVIDENDS_TO_TREASURY = "MU Dividends To Treasury";

const iface = new Interface([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function modifyLiquidity((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,(int24 tickLower,int24 tickUpper,int256 liquidityDelta,bytes32 salt) params,bytes hookData) returns (int256 callerDelta,int256 feesAccrued)",
]);
const pad = (address: string) => "0x" + address.slice(2).padStart(64, "0");
const lower = (value: string) => value.toLowerCase();

const TRANSFER_TOPIC = iface.getEvent("Transfer")!.topicHash;

// Hex-string offsets (1-indexed characters; "0x" occupies 1..2, byte n sits at 3 + 2n).
// modifyLiquidity calldata:
//   bytes 0..3     selector
//   bytes 4..163   PoolKey, five static words: currency0, currency1, fee, tickSpacing, hooks
//   bytes 164..291 ModifyLiquidityParams; salt (bytes 260..291) is the PositionManager tokenId
// Return data: (callerDelta, feesAccrued); feesAccrued packs two int128 into
// bytes 32..63. Only feesAccrued is income: principal and deposits are excluded.
// Snowflake has no keccak, so pools are matched on the raw PoolKey bytes, which
// the Initialize log reproduces as topic2 || topic3 || first three data words.
// Ownership is the last non-burn NFT transfer at or before the trace, so the
// PositionManager's burn-before-collect ordering does not lose the final payout.
// Allium propagates a reverted ancestor into status = 0 on every child trace.
const sql = (options: FetchOptions) => `
WITH pools AS (
  SELECT DISTINCT lower(substr(topic2, 3) || substr(topic3, 3) || substr(data, 3, 192)) AS pool_key
  FROM robinhood.raw.logs
  WHERE address = '${POOL_MANAGER}'
    AND topic0 = '${iface.getEvent("Initialize")!.topicHash}'
    AND (topic2 = '${pad(SHROOM)}' OR topic3 = '${pad(SHROOM)}')
    AND topic1 <> '${GENESIS_POOL}'
),
modifications AS (
  SELECT block_number, transaction_index, transaction_hash,
    lower(substr(input, 11, 320)) AS pool_key,
    lower('0x' || substr(input, 35, 40)) AS token0,
    lower('0x' || substr(input, 99, 40)) AS token1,
    lower('0x' || substr(input, 291, 40)) AS hooks,
    lower('0x' || substr(input, 523, 64)) AS token_id,
    substr(output, 67, 32) AS amount0,
    substr(output, 99, 32) AS amount1
  FROM robinhood.raw.traces
  WHERE block_timestamp >= to_timestamp_ntz(${options.startTimestamp})
    AND block_timestamp < to_timestamp_ntz(${options.endTimestamp})
    AND from_address = '${POSITION_MANAGER}'
    AND to_address = '${POOL_MANAGER}'
    AND selector = '${iface.getFunction("modifyLiquidity")!.selector}'
    AND call_type = 'call'
    AND status = 1 AND error IS NULL
),
owners AS (
  SELECT lower(topic3) AS token_id, lower('0x' || substr(topic2, 27)) AS owner, block_number, transaction_index,
    LEAD(block_number) OVER (PARTITION BY topic3 ORDER BY block_number, transaction_index, log_index) AS next_block_number,
    LEAD(transaction_index) OVER (PARTITION BY topic3 ORDER BY block_number, transaction_index, log_index) AS next_transaction_index
  FROM robinhood.raw.logs
  WHERE address = '${POSITION_MANAGER}'
    AND topic0 = '${TRANSFER_TOPIC}'
    AND topic3 IS NOT NULL
    AND topic2 <> '${pad(ZeroAddress)}'
)
SELECT m.transaction_hash, m.token0, m.token1, m.hooks, m.amount0, m.amount1
FROM modifications m
JOIN pools p ON p.pool_key = m.pool_key
JOIN owners o ON o.token_id = m.token_id
  AND (o.block_number < m.block_number
    OR (o.block_number = m.block_number AND o.transaction_index <= m.transaction_index))
  AND (o.next_block_number IS NULL
    OR m.block_number < o.next_block_number
    OR (m.block_number = o.next_block_number AND m.transaction_index < o.next_transaction_index))
WHERE o.owner IN (${TREASURY.map(t => `'${t}'`).join(", ")})
`;

// Receipts are measured independently of hook sweeps: distribution can happen
// later. Do not multiply a sweep by the treasury's current SHROOM balance, and
// do not count all-holder dividends as treasury income.
const fetchTreasuryDividends = async (options: FetchOptions) => {
  const dividends = options.createBalances();
  const logs = await options.getLogs({
    target: MU, eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [TRANSFER_TOPIC, pad(DISTRIBUTOR), TREASURY.map(pad)] as any,
  });
  for (const log of logs) dividends.add(MU, log.value);
  return dividends;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const rows: any[] = await queryAllium(sql(options));
  for (const row of rows) {
    if (row.amount0?.length !== 32 || row.amount1?.length !== 32) throw new Error(`Malformed feesAccrued in ${row.transaction_hash}`);
    const amount0 = BigInt("0x" + row.amount0);
    const amount1 = BigInt("0x" + row.amount1);
    // feesAccrued is signed; a set sign bit means a negative fee, which Uniswap never returns.
    if (amount0 >> 127n || amount1 >> 127n) throw new Error(`Negative Uniswap feesAccrued in ${row.transaction_hash}`);
    // Liquidity-return-delta hooks can take part of feesAccrued. Do not claim
    // the gross amount as treasury income without modelling that hook's cut.
    if ((BigInt(row.hooks) & 3n) !== 0n && (amount0 || amount1))
      throw new Error(`Liquidity-return-delta hook requires attribution: ${row.hooks}`);
    for (const [token, amount] of [[lower(row.token0), amount0], [lower(row.token1), amount1]] as const) {
      dailyFees.add(token, amount, METRIC.LP_FEES);
      dailyRevenue.add(token, amount, LP_REVENUE);
      dailyProtocolRevenue.add(token, amount, LP_REVENUE);
    }
  }

  const dividends = await fetchTreasuryDividends(options);
  dailyFees.add(dividends, DIVIDENDS);
  dailyRevenue.add(dividends, DIVIDENDS_TO_TREASURY);
  dailyProtocolRevenue.add(dividends, DIVIDENDS_TO_TREASURY);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const description = "Earned fees realized when a treasury-owned SHROOM Uniswap v4 position is modified, including collection, withdrawal, burn, and fees offset against new deposits. Read from the feesAccrued return value of PoolManager.modifyLiquidity in Allium's robinhood.raw.traces; principal is excluded. Ownership is reconstructed at the modification. The genesis hook pool is excluded.";
const dividendDescription = "MU dividends actually received from the Pons distributor by the two confirmed treasury wallets, recognized on receipt. Excludes transfers to other holders, arbitrary MU deposits, and transfers between treasury wallets. Shared MU payouts do not encode which launch generated them.";
const treasuryDescription = "Treasury income only: earned fees from treasury-owned SHROOM LP positions plus actual MU dividend receipts. Token balances and returned LP principal are not income. All-holder SHROOM dividend allocations are reported separately in shroom.ts; do not sum the two scopes.";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-02",
  fetch,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  // LP income overlaps Uniswap; treasury MU receipts are also contained in the
  // token dividend stream. This treasury view must not be added to shroom.ts.
  doublecounted: true,
  methodology: { Fees: treasuryDescription, Revenue: treasuryDescription, ProtocolRevenue: treasuryDescription },
  breakdownMethodology: {
    Fees: { [METRIC.LP_FEES]: description, [DIVIDENDS]: dividendDescription },
    Revenue: { [LP_REVENUE]: description, [DIVIDENDS_TO_TREASURY]: dividendDescription },
    ProtocolRevenue: { [LP_REVENUE]: description, [DIVIDENDS_TO_TREASURY]: dividendDescription },
  },
};
export default adapter;