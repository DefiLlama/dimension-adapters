// pools.trade — Uniswap Labs' token launchpad on Robinhood Chain, built on the
// Uniswap Liquidity Launcher (https://pools.trade).
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
// Canonical LBPStrategy, shared chain-wide: a crowd launch is only pools.trade's
// when its position lands in a pools.trade FeeSplitter.
const LBP_STRATEGY = "0x05d552391067389ee44fec3924157ed33f976000";

// InstantLaunchStrategy deployments, from the pools.trade app's own registry.
// The stack has been redeployed ~weekly; new ones must be added here.
const STRATEGIES = [
  "0x60d73b21cdf2ea846ab3d58699bbbb8f29d72491", // 2026-07-29, creator fees
  "0xfce92c70f1fc017b72f6dd7a00d9e38725c7fbd1", // 2026-07-29
  "0xce57498d3474dcc244dfb6710ffbe6d4441cd2b2", // 2026-07-30, creator fees
  "0x583a7903152b95831e82fff534448dee081754ec", // 2026-07-30
  "0x9f67b864b565966dfcc2e0c6ba2483b2d5ff4b00", // 2026-07-30, creator fees
  "0x16b63f1c8415fd68591c31fb3c6796a333dd640c", // 2026-07-30
  "0x3f556b542105d5efbbefe7c766a4919c76b960fb", // 2026-08-05, creator fees
  "0x36bdb859518c89f764337cd5c24762d2aa650f3c", // 2026-08-05
  "0x23f8209572b4a1c2ad88a42749e830791fb027f1", // 2026-08-05, creator fees, current
  "0xad44d55e7f8337c3ce113fbb591486e85be104b2", // 2026-08-05, current
];

// Splitters paying the creator 40% of the ETH-side fee; the other two send 100%
// of both sides to the compounder.
const CREATOR_FEE_SPLITTERS = [
  "0x7198c32a497c09497e04c86cf8f77a244a9e4b8f",
  "0x6cc1b74fc1be1ff373fa07f3381856f38103e653",
  "0xeff166aaf189323c58dc27ed1206eb2c37faacdf",
];
const SPLITTERS = [
  ...CREATOR_FEE_SPLITTERS,
  "0xdf50f4ea2207f9d2a753a3dae729b36fdef13b23",
  "0x222d6d4f1ce59b0d48d5505114ec8addc90a4359",
];

const CREATOR_NATIVE_BPS = 4000;
const LP_FEE = 2500;

// TokenLaunched(bytes32 indexed poolId, address indexed token, address indexed finalPositionRecipient, PoolKey key)
const TOKEN_LAUNCHED = "0x3b3d2bafdcae274a232217e1f80ee4305d3af6aa25c8b14b1681bd68d18042a4";
// Migrated(address indexed initializer, PoolKey indexed key, uint160 initialSqrtPriceX96, bytes plan)
const MIGRATED = "0xbcc36534419debbbf0f25857d1fef3e4bbce9527091c805e9a7da93dbfd828f4";
const ERC721_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const list = (values: string[]) => values.map(v => `'${v}'`).join(", ");

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    WITH pt_pools AS (
      SELECT DISTINCT topic1 AS pool_id, '0x' || SUBSTR(topic3, 27) AS fee_splitter
      FROM crosschain.raw.logs
      WHERE chain = 'robinhood'
        AND topic0 = '${TOKEN_LAUNCHED}'
        AND address IN (${list(STRATEGIES)})

      UNION

      SELECT DISTINCT m.pool_id, p.fee_splitter
      FROM (
        SELECT transaction_hash, topic2 AS pool_id
        FROM crosschain.raw.logs
        WHERE chain = 'robinhood' AND address = '${LBP_STRATEGY}' AND topic0 = '${MIGRATED}'
      ) m
      JOIN (
        SELECT transaction_hash, '0x' || SUBSTR(topic2, 27) AS fee_splitter
        FROM crosschain.raw.logs
        WHERE chain = 'robinhood' AND address = '${POSITION_MANAGER}' AND topic0 = '${ERC721_TRANSFER}'
          AND '0x' || SUBSTR(topic2, 27) IN (${list(SPLITTERS)})
      ) p ON p.transaction_hash = m.transaction_hash
    ),
    swaps AS (
      SELECT
        TO_DECIMAL(l.params:amount0::STRING, 38, 0) AS amount0,
        TO_DECIMAL(l.params:fee::STRING, 38, 0) AS fee,
        p.fee_splitter AS fee_splitter
      FROM crosschain.decoded.logs l
      JOIN pt_pools p ON p.pool_id = l.params:id::STRING
      WHERE l.chain = 'robinhood'
        AND l.address = '${POOL_MANAGER}'
        AND l.name = 'Swap'
        AND l.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND l.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    split AS (
      SELECT
        ABS(amount0) AS volume,
        ABS(amount0) * fee / 1e6 AS total_fee,
        -- protocol fee comes off the input before the LP fee, so it backs out of
        -- the event's combined rate as (fee - lpFee) / (1 - lpFee)
        ABS(amount0) * GREATEST(fee - ${LP_FEE}, 0) / (1 - ${LP_FEE} / 1e6) / 1e6 AS protocol_fee,
        -- creators are paid only out of ETH-side fees, i.e. buys
        amount0 > 0 AND fee_splitter IN (${list(CREATOR_FEE_SPLITTERS)}) AS pays_creator
      FROM swaps
    )
    SELECT
      SUM(volume) AS volume,
      SUM(total_fee) AS total_fee,
      SUM(CASE WHEN pays_creator THEN (total_fee - protocol_fee) * ${CREATOR_NATIVE_BPS} / 1e4 ELSE 0 END) AS creator_fee,
      SUM(total_fee - protocol_fee) AS lp_fee
    FROM split
  `;

  const [row] = await queryAllium(query);

  dailyVolume.addGasToken(row.volume);
  dailyFees.addGasToken(row.total_fee, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addGasToken(row.creator_fee, METRIC.CREATOR_FEES);
  dailySupplySideRevenue.addGasToken(Number(row.lp_fee) - Number(row.creator_fee), "Fees Compounded Into Locked Liquidity");

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Volume: "The ETH side of every trade in a pools.trade pool — ETH spent buying the token and ETH received selling it, counted once per trade.",
  Fees: "The 0.25% fee charged on every trade, plus Uniswap's own 0.04% protocol fee where it has been switched on for the pool. pools.trade charges nothing to launch a token and takes no cut of the raise.",
  SupplySideRevenue: "The whole 0.25% trading fee: the creator's share plus the part that is compounded back into the locked liquidity.",
  Revenue: "Zero. pools.trade keeps none of the trading fee — the 0.25% goes entirely to the token's creator and back into the pool's own locked liquidity. The 0.04% Uniswap charges on top is Uniswap Protocol revenue, burned as UNI, and is counted in the Uniswap adapter rather than here.",
  ProtocolRevenue: "Zero. pools.trade has no treasury cut, no launch fee and no graduation fee.",
  HoldersRevenue: "Zero. There is no pools.trade token.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.25% of every trade, plus Uniswap's 0.04% v4 protocol fee on pools where the fee switch is live (read per trade from the swap's own fee rate).",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "40% of the fees charged in ETH, held for the token's creator to claim. Only paid on launches created with the creator fee enabled, and never out of fees charged in the token.",
    "Fees Compounded Into Locked Liquidity": "Everything left of the 0.25% fee, added straight back into the pool's permanently locked position instead of being paid out to anyone.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.ALLIUM],
  doublecounted: true,
  start: "2026-07-30", // first Instant Launch, 2026-07-30 16:41:56 UTC
};

export default adapter;
