/**
 * OnOne launchpad fees for DefiLlama dimension-adapters.
 * Drop this folder in as fees/onone/ (this path is only so the file can be reviewed here).
 *
 * EVM: every live hook emits FeeTaken for the quote-token fee on buys and sells.
 *      The matching escrow Credited events are the same fees, already split.
 *      A launch also pays the router's creation fee, in the chain's native coin.
 * Solana: OnOne opens a Meteora DAMM v2 pool directly. There is no OnOne program
 *      that lists those pools, so each pool address is named below. The figure used
 *      is the LP fee (Meteora's own protocol cut stays on Meteora's listing), read per
 *      swap from the pool's EvtSwap2 events on Allium.
 *      The creator position keeps creatorPct of that LP fee. OnOne keeps the rest.
 */
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { timeFilter, u64, u8 } from "../../helpers/alliumSolanaEvents";
import { base58Decode, base58Encode, getAccountBuffers } from "../../helpers/solana";

const TREASURY = "0xf2D1f6A26989BFC164840c253eDcEC107a55Fa48";

const FEE_TAKEN = "event FeeTaken(bytes32 indexed id, address indexed trader, address quote, uint256 totalFee, address referrer)";
const CREDITED = "event Credited(address indexed account, address indexed token, uint256 amount)";
const LAUNCHED = "event Launched(address indexed token, address indexed creator, address quote, bytes32 poolId, uint128 liquidity)";

const SWAP_FEES = "Swap Fees";
const LAUNCH_FEES = "Launch Fees";
const CREATOR_FEES = "Creator and referrer fees";

type Suite = { hooks: string[]; escrows: string[]; routers: string[] };

const EVM: Record<string, Suite> = {
  [CHAIN.BASE]: {
    hooks: [
      "0x502ce07B31f2C2c652D65153c8722ab1DD56cacC",
      "0x76aCCCF81E1b785f1722BCCeB3B0624Dfb490aCC",
      "0x5fa041b24091D5e5Ac1B9F3E51722Abcfb0cCaCC",
      "0xFDC06cB1C86797303Bf551205c4942d1A0b00acc",
      "0x985C14BAa2a18316ffdA0aeFB3a632fAdfcA2AcC",
    ],
    escrows: [
      "0xA254AA83FE36c35dBeE3B2f23b01d80128185b49",
      "0x1AF210eC8e5e6F6fC511085d6e15d12Be728b7EE",
      "0xaD0A2BdFB35953cA75dA139194b1dEc5bad23CF0",
      "0xEfc80C5c1ef9EB0B7DfCC1061Ae5585592A8f959",
    ],
    routers: [
      "0xA20e3737227c6c707B1CF5Bec879723c984470Ee",
      "0x826C3C1e9E9F50DEcE2d9F076cdEF8f861f50F85",
      "0x99444176229B3Bc05282c2c2Bf5d15403eA6AC9E",
      "0x21a9C8A479b405427DE2007afc5d6179891cE880",
    ],
  },
  [CHAIN.ROBINHOOD]: {
    hooks: ["0x8725d243b5aadF23763C0768C815379d0870cACC"],
    escrows: ["0x5603fF223983679554F56951033A38715A801142"],
    routers: ["0x23c24C9F4cD644c7D5c3d92F45c732808C6e299C"],
  },
  [CHAIN.ARC]: {
    hooks: ["0x8725d243b5aadF23763C0768C815379d0870cACC"],
    escrows: ["0x5603fF223983679554F56951033A38715A801142"],
    routers: ["0x23c24C9F4cD644c7D5c3d92F45c732808C6e299C"],
  },
  [CHAIN.BSC]: {
    hooks: ["0x8b80cAA8a9fD75B5Fff923f5806c07F742B30ACC"],
    escrows: ["0x5603fF223983679554F56951033A38715A801142"],
    routers: ["0x23c24C9F4cD644c7D5c3d92F45c732808C6e299C"],
  },
};

/**
 * Every OnOne Meteora DAMM v2 pool. There is no OnOne program that lists them,
 * and Meteora's own pool list includes every Meteora pool, so a new launch is added here.
 */
const SOL_POOLS: { pool: string; creatorPct: number }[] = [
  // created 2026-10-23 15:02 UTC by EEDrtBtH8DHhcjCLPNyCRVT5VQExNKNqsRpnR2MJbS46, which holds its only (permanently locked) position
  { pool: "82864UJ9DJvy62M5hzQwZKVSLi51gT6etbfuvPhE7Prk", creatorPct: 60 },
];

// https://solscan.io/account/cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
const DAMM_V2 = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
// Meteora emits its events with emit_cpi!, as self-CPIs: 8-byte tag, 8-byte discriminator, then the Borsh body
const EVENT_CPI_TAG = "e445a52e51cb9a1d";
const EVT_SWAP2 = "bd4233a826507599";
// EvtSwap2 length in bytes, tag and discriminator included (MeteoraAg/damm-v2 programs/cp-amm/src/event.rs)
const EVT_SWAP2_LENGTH = 196;

async function evm(options: FetchOptions) {
  const suite = EVM[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const trades = await options.getLogs({ targets: suite.hooks, eventAbi: FEE_TAKEN });
  for (const log of trades) dailyFees.add(log.quote, log.totalFee, SWAP_FEES);

  const credits = await options.getLogs({ targets: suite.escrows, eventAbi: CREDITED });
  for (const log of credits) {
    const toProtocol = String(log.account).toLowerCase() === TREASURY.toLowerCase();
    if (toProtocol) dailyRevenue.add(log.token, log.amount, SWAP_FEES);
    else dailySupplySideRevenue.add(log.token, log.amount, CREATOR_FEES);
  }

  // one list of launches per router, because each router has its own creation fee
  const launches: any[][] = await options.getLogs({ targets: suite.routers, eventAbi: LAUNCHED, flatten: false });
  const launched = suite.routers.map((router, i) => ({ router, count: launches[i].length })).filter(({ count }) => count > 0);
  if (launched.length) {
    const feesWei = await options.api.multiCall({ abi: "uint256:creationFeeWei", calls: launched.map(({ router }) => router) });
    launched.forEach(({ count }, i) => {
      const total = BigInt(count) * BigInt(feesWei[i]);
      dailyFees.addGasToken(total, LAUNCH_FEES);
      dailyRevenue.addGasToken(total, LAUNCH_FEES);
    });
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
}

async function solana(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // DAMM v2 Pool (programs/cp-amm/src/state/pool.rs): token_a_mint at 168, token_b_mint at 200, both fixed at creation
  const buffers = await getAccountBuffers({ chain: CHAIN.SOLANA, accounts: SOL_POOLS.map(({ pool }) => pool) });
  const pools: Record<string, { mintA: string; mintB: string; creatorPct: number }> = {};
  SOL_POOLS.forEach(({ pool, creatorPct }, i) => {
    const data = buffers[i];
    if (!data) throw new Error(`OnOne: Meteora pool ${pool} not found`);
    pools[Buffer.from(base58Decode(pool)).toString("hex")] = {
      mintA: base58Encode(data.subarray(168, 200)),
      mintB: base58Encode(data.subarray(200, 232)),
      creatorPct,
    };
  });

  const rows = await queryAllium(`
    WITH events AS (
      SELECT data_hex, LENGTH(data_hex) / 2 AS len
      FROM solana.raw.inner_instructions
      WHERE program_id = '${DAMM_V2}'
        AND parent_tx_success
        AND ${timeFilter(options)}
        AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'
        AND SUBSTR(data_hex, 17, 16) = '${EVT_SWAP2}'
        -- pool is the first field of the event
        AND SUBSTR(data_hex, 33, 64) IN (${Object.keys(pools).map((hex) => `'${hex}'`).join(", ")})
    )
    SELECT 'check' AS kind, NULL AS pool, NULL AS fee_on_a, NULL AS fee,
      (SELECT COUNT_IF(len <> ${EVT_SWAP2_LENGTH}) FROM events) AS unknown_layout,
      -- the transfers table is built from the raw ones, so rows past the window mean the window is complete
      EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    UNION ALL
    -- EvtSwap2: trade_direction at 48 (1 = B to A), collect_fee_mode at 49 (0 = both tokens), claiming_fee at 116,
    -- compounding_fee at 132. The fee is in token A only for a B to A swap in a both-token pool (FeeMode::get_fee_mode).
    SELECT 'swap', SUBSTR(data_hex, 33, 64), (${u8("data_hex", 48)} = '01' AND ${u8("data_hex", 49)} = '00'),
      TO_VARCHAR(SUM(${u64("data_hex", 116)} + ${u64("data_hex", 132)})), NULL, NULL
    FROM events
    WHERE len = ${EVT_SWAP2_LENGTH}
    GROUP BY 2, 3
  `);

  const check = rows.find((row: any) => String(row.kind).toLowerCase() === "check");
  if (!check) throw new Error("OnOne: empty Allium response");
  if (!check.indexed) throw new Error(`OnOne: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(check.unknown_layout) > 0) throw new Error(`OnOne: ${check.unknown_layout} Meteora swap events with an unknown layout, the program was likely upgraded`);

  for (const row of rows) {
    if (String(row.kind).toLowerCase() !== "swap") continue;
    const { mintA, mintB, creatorPct } = pools[row.pool];
    const mint = row.fee_on_a ? mintA : mintB;
    const lpFees = BigInt(row.fee);
    const creator = (lpFees * BigInt(creatorPct)) / 100n;
    dailyFees.add(mint, lpFees.toString(), SWAP_FEES);
    dailyRevenue.add(mint, (lpFees - creator).toString(), SWAP_FEES);
    dailySupplySideRevenue.add(mint, creator.toString(), CREATOR_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Quote-token fees taken by the OnOne launch hook on each swap, plus the native coin paid to launch a coin. On Solana, the LP fee earned by the OnOne Meteora pool (Meteora's own protocol cut is left on Meteora's listing). The 1% fee on swaps routed through the OnOne site is taken inside the Uniswap router and has no separate event, so it is not estimated here.",
  UserFees: "Quote-token fees taken by the OnOne launch hook on each swap, plus the native coin paid to launch a coin. On Solana, the LP fee earned by the OnOne Meteora pool (Meteora's own protocol cut is left on Meteora's listing). The 1% fee on swaps routed through the OnOne site is taken inside the Uniswap router and has no separate event, so it is not estimated here.",
  Revenue: "The protocol lane of each swap fee, credited to the OnOne treasury, plus the full launch fee. On Solana, the platform's share of the LP fee (40% when the creator share is 60%). The site's 1% routing fee is not included, because the router does not emit it on its own.",
  ProtocolRevenue: "The protocol lane of each swap fee, credited to the OnOne treasury, plus the full launch fee. On Solana, the platform's share of the LP fee (40% when the creator share is 60%).",
  SupplySideRevenue: "The creator lane and the referrer lane of each swap fee. On Solana, the creator position's share of the LP fee.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Hook swap fees, denominated in the pool's quote token. On Solana, the LP fee of each swap in an OnOne Meteora pool.",
    [LAUNCH_FEES]: "Router creation fee paid once per launch, in the chain's native coin.",
  },
  UserFees: {
    [SWAP_FEES]: "Paid by the trader on a buy or a sell.",
    [LAUNCH_FEES]: "Paid by the creator when the coin is launched.",
  },
  Revenue: {
    [SWAP_FEES]: "Protocol share credited to the treasury. On Solana, the platform share of the LP fee.",
    [LAUNCH_FEES]: "The whole launch fee is kept by the treasury.",
  },
  ProtocolRevenue: {
    [SWAP_FEES]: "Protocol share credited to the treasury.",
    [LAUNCH_FEES]: "The whole launch fee is kept by the treasury.",
  },
  SupplySideRevenue: {
    [CREATOR_FEES]: "Creator and referrer credits. On Solana, the creator position's share of the LP fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: { fetch: evm, start: "2026-09-18" },
    [CHAIN.ROBINHOOD]: { fetch: evm, start: "2026-09-21" },
    [CHAIN.ARC]: { fetch: evm, start: "2026-09-25" },
    [CHAIN.BSC]: { fetch: evm, start: "2026-09-25" },
    // first OnOne pool created 2026-10-23 15:02 UTC
    [CHAIN.SOLANA]: { fetch: solana, start: "2026-10-23" },
  },
};

export default adapter;
