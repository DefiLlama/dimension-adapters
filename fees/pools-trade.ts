// pools.trade — Uniswap Labs' token launchpad on Robinhood Chain, built on the
// Uniswap Liquidity Launcher (https://pools.trade).
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Uniswap v4 singletons on Robinhood Chain (developers.uniswap.org v4 deployments)
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
// pools.trade token factory — the single contract every launch mints through
const UERC20_FACTORY = "0x000000e200088d55c39a11f609e5f667729ad49b";

// TokenCreated(address tokenAddress, (string,string,string,bytes) metadata)
const TOKEN_CREATED = "0x4ef8284ecf42d4cd19686572ffd87f630858c82398911e776cb831de35eddbf4";
const ERC721_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const LP_FEE = 2500; // InstantLaunchStrategy.LP_FEE / LBP graduation lpFee, in pips

// UERC20Factory deployment (block 4516017, 2026-07-08 16:55:22 UTC): nothing
// pools.trade-related exists on the chain before this, so all discovery scans
// start here. Note this is a constant, NOT options.startTimestamp — a swap in
// today's window can happen on a pool launched any day since genesis.
const FACTORY_DEPLOY_TIMESTAMP = 1783529722;

const SPLITS_ABI =
  "function getSplits() view returns (tuple(address recipient, uint256 currency0Bps, uint256 currency1Bps, uint256 mode)[])";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    WITH factory_tokens AS (
      SELECT DISTINCT '0x' || LOWER(SUBSTR(data, 27, 40)) AS token
      FROM crosschain.raw.logs
      WHERE chain = 'robinhood'
        AND address = '${UERC20_FACTORY}'
        AND topic0 = '${TOKEN_CREATED}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${FACTORY_DEPLOY_TIMESTAMP})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    -- every pools.trade pool: the canonical 0.25% hookless ETH pool of a factory
    -- token. Instant launches initialize it at creation, crowd launches at
    -- graduation; a pool key can only be initialized once, so this is exact.
    pt_pools AS (
      SELECT
        i.params:id::STRING AS pool_id,
        i.transaction_hash AS transaction_hash
      FROM crosschain.decoded.logs i
      WHERE i.chain = 'robinhood'
        AND i.address = '${POOL_MANAGER}'
        AND i.name = 'Initialize'
        AND LOWER(i.params:currency0::STRING) = '${ZERO_ADDRESS}'
        AND LOWER(i.params:hooks::STRING) = '${ZERO_ADDRESS}'
        AND TRY_TO_NUMBER(i.params:fee::STRING) = ${LP_FEE}
        AND i.block_timestamp >= TO_TIMESTAMP_NTZ(${FACTORY_DEPLOY_TIMESTAMP})
        AND i.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND LOWER(i.params:currency1::STRING) IN (SELECT token FROM factory_tokens)
    ),
    -- whoever the locked position NFT is minted to in the same transaction is the
    -- pool's FeeSplitter (or the crowd locker / a third-party recipient)
    position_recipients AS (
      -- the position's final holder within the launch tx. Custody is two-hop on
      -- instant launches (minted to the strategy, then transferred to the
      -- FeeSplitter one log later), one-hop on crowd graduations (minted straight
      -- to the locker) — so take the LAST transfer per tx, never the mint.
      SELECT transaction_hash, recipient
      FROM (
        SELECT
          transaction_hash,
          '0x' || LOWER(SUBSTR(topic2, 27)) AS recipient,
          ROW_NUMBER() OVER (PARTITION BY transaction_hash ORDER BY log_index DESC) AS rn
        FROM crosschain.raw.logs
        WHERE chain = 'robinhood'
          AND address = '${POSITION_MANAGER}'
          AND topic0 = '${ERC721_TRANSFER}'
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${FACTORY_DEPLOY_TIMESTAMP})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      )
      WHERE rn = 1
    ),
    pools AS (
      SELECT p.pool_id, MIN(m.recipient) AS recipient
      FROM pt_pools p
      LEFT JOIN position_recipients m ON m.transaction_hash = p.transaction_hash
      GROUP BY p.pool_id
    ),
    swaps AS (
      SELECT
        TO_DECIMAL(l.params:amount0::STRING, 38, 0) AS amount0,
        TO_DECIMAL(l.params:fee::STRING, 38, 0) AS fee,
        p.recipient AS recipient
      FROM crosschain.decoded.logs l
      JOIN pools p ON p.pool_id = l.params:id::STRING
      WHERE l.chain = 'robinhood'
        AND l.address = '${POOL_MANAGER}'
        AND l.name = 'Swap'
        AND l.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND l.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    split AS (
      SELECT
        recipient,
        ABS(amount0) * fee / 1e6 - ABS(amount0) * GREATEST(fee - ${LP_FEE}, 0) / (1 - ${LP_FEE} / 1e6) / 1e6 AS lp_fee,
        amount0 < 0 AS is_buy
      FROM swaps
    )
    SELECT
      recipient,
      SUM(lp_fee) AS lp_fee,
      SUM(CASE WHEN is_buy THEN lp_fee ELSE 0 END) AS eth_side_lp_fee
    FROM split
    GROUP BY recipient
  `;

  const rows: any[] = await queryAllium(query);

  const recipients = [...new Set(rows.map((r) => r.recipient).filter(Boolean))];
  const splits = await options.api.multiCall({
    abi: SPLITS_ABI,
    calls: recipients.map((target: string) => ({ target })),
    permitFailure: true,
  });
  const creatorNativeBps: Record<string, number> = {};
  recipients.forEach((recipient, i) => {
    creatorNativeBps[recipient] = (splits[i] ?? [])
      .filter((s: any) => Number(s.currency1Bps) === 0)
      .reduce((acc: number, s: any) => acc + Number(s.currency0Bps), 0);
  });

  for (const row of rows) {
    const bps = creatorNativeBps[row.recipient] ?? 0;
    const creatorFee = (Number(row.eth_side_lp_fee) * bps) / 1e4;
    dailyFees.addGasToken(row.lp_fee, METRIC.SWAP_FEES);
    dailySupplySideRevenue.addGasToken(creatorFee, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.addGasToken(
      Number(row.lp_fee) - creatorFee,
      "Fees Compounded Into Locked Liquidity",
    );
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "The 0.25% fee charged on every trade, taken in whichever token the trader pays with. pools.trade charges nothing to launch a token and takes no cut of the raise. Traders also pay Uniswap's own 0.04% protocol fee on pools where it is switched on; that is Uniswap's charge, not pools.trade's, and is left out here.",
  SupplySideRevenue: "The whole 0.25% trading fee: the creator's share plus the part that is compounded back into the locked liquidity.",
  Revenue: "Zero. pools.trade keeps none of the trading fee — it all goes to the token's creator and back into the pool's own permanently locked liquidity.",
  ProtocolRevenue: "Zero. pools.trade has no treasury cut, no launch fee and no graduation fee.",
  HoldersRevenue: "Zero. There is no pools.trade token.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.25% of every trade, read per trade from the swap's own fee rate with Uniswap's separate 0.04% protocol fee removed.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "The creator vault's share of fees charged in ETH (i.e. on buys), read from each pool's FeeSplitter.getSplits() — 40% on current deployments. Only paid on launches created with the creator fee enabled, and never out of fees charged in the token.",
    "Fees Compounded Into Locked Liquidity": "Everything else, added straight back into the pool's permanently locked position instead of being paid out to anyone.",
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
  doublecounted: true, // pools are plain Uniswap V4, also counted by the uniswap adapter
  start: "2026-07-30", // first Instant Launch, 2026-07-30 16:41:56 UTC
};

export default adapter;
