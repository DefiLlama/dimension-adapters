import { FetchOptions } from "../adapters/types";
import { queryAllium } from "./allium";
import { base58Decode, base58Encode, findProgramAddress, getAccountBuffers } from "./solana";
import ADDRESSES from "./coreAssets.json";

// Bordrless (https://bordrless.app) program ids, from https://github.com/BordrlessDex/bordrless-sdk
// (packages/shared/src/programs.ts). Trades settle in Bordrless's own token program, not SPL, so they
// are read from the DEX's Anchor event CPIs (docs/integration/03-indexing-trades.md), not from token
// transfers. Checked hour by hour against Bordrless's own stats
// (https://bordrless.app/api/stats/defillama?start=&end=) from 2026-10-08 to 2026-10-14: every field
// matches, except that the API books LP fees charged in a launched coin as SOL.
const TOKEN_PROGRAM = "2XoEWp8cF3kRXg74eVwPAyTFhVCAztn3V88komxAvr22";
const SWAP_PROGRAM = "GyzKSnnEu2uN5bBRecE4XYY2enbfR2D2MtxnbJPGy7hk";
const BRIDGE_PROGRAM = "CtLkuFVitoXHTa86Hfp8KmfSDfqJaMYFWr6EGmQVsKb7";
const LAUNCH_PROGRAM = "1jcBymHxBjniZDhNPy51Vgm5Nz7pLUdxa9UBHc4TavC";
const KIT_PROGRAM = "14RJQXPdJfkehit6ezktjd3xujamf8nVSKw2shKamaEH";

// Event CPI data: the 8-byte Anchor event tag, then the event's discriminator (idl/bordrless_swap.json)
const EVENT_TAG = "e445a52e51cb9a1d";
const SWAPPED = "d93434539387606d";
const CURVE_FINALIZED = "98e0564468df3953";

// Bridged assets are wrapper mints PDA(["wrapped", underlying]) under the bridge, backed 1:1 by its vaults
// (https://bordrless.app/api/stats/defillama/vaults); amounts in them are counted as the underlying.
const BRIDGED_UNDERLYINGS = [
  ADDRESSES.solana.SOL,
  "6Mix12LiHrQFojaQEnfPUC65Qkwd6X4Y5Qg93oFbordr", // $BORDR
];

// The Allium API returns at most 10,000 rows per query, without saying so
const ALLIUM_PAGE_SIZE = 10000;

const pda = (seeds: (string | Buffer)[], program: string) => findProgramAddress(seeds, program)[0];
const pubkey = (key: string) => Buffer.from(base58Decode(key));
const holding = (mint: string, owner: string) => pda(["holding", pubkey(mint), pubkey(owner)], TOKEN_PROGRAM);
const underlyingOf: Record<string, string> = Object.fromEntries(BRIDGED_UNDERLYINGS.map((u) => [pda(["wrapped", pubkey(u)], BRIDGE_PROGRAM), u]));
const told = (mint: string) => underlyingOf[mint] ?? mint;
const launch = (base: string) => pda(["launch", pubkey(base)], LAUNCH_PROGRAM);
const kit = (base: string) => pda(["kit", pubkey(base)], KIT_PROGRAM);

type Delta = { holding: string; amount: bigint };
type Swap = {
  txn: string; pool: string; buy: boolean; amountIn: bigint; deltasIn: Delta[]; lpFee: bigint; protocolFee: bigint;
  deltasOut: Delta[]; deliveredOut: bigint; virtualQuote: bigint;
};

// The Swapped event body, in idl/bordrless_swap.json field order
function decodeSwapped(txn: string, data: Buffer): Swap {
  let offset = 16;
  const key = () => { const k = base58Encode(data.subarray(offset, offset + 32)); offset += 32; return k; };
  const u64 = () => { const v = data.readBigUInt64LE(offset); offset += 8; return v; };
  const deltas = () => { const n = data.readUInt32LE(offset); offset += 4; return Array.from({ length: n }, () => ({ holding: key(), amount: u64() })); };
  const pool = key();
  key(); key(); // trader, recipient
  const buy = data.readUInt8(offset++) === 1; // direction: 1 buy (quote in), 0 sell
  const amountIn = u64();
  const deltasIn = deltas();
  u64(); u64(); u64(); // burn_in, cuts_in, received_in
  const lpFee = u64();
  const protocolFee = u64();
  offset += 2; // lp_fee_bps
  u64(); // amount_out
  const deltasOut = deltas();
  u64(); u64(); // burn_out, cuts_out
  const deliveredOut = u64();
  u64(); u64(); u64(); // base_reserve, quote_reserve, virtual_base
  const virtualQuote = u64();
  return { txn, pool, buy, amountIn, deltasIn, lpFee, protocolFee, deltasOut, deliveredOut, virtualQuote };
}

async function getSwaps(options: FetchOptions) {
  const rows: { txn_id: string; data: string }[] = [];
  for (let page = 0; ; page++) {
    // event CPIs are the program's calls to itself whose only account is its event authority
    const batch = await queryAllium(`
      SELECT txn_id, data
      FROM solana.raw.inner_instructions
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND program_id = '${SWAP_PROGRAM}'
        AND parent_tx_success
        AND ARRAY_SIZE(accounts) = 1
      ORDER BY block_slot, txn_index, instruction_index, inner_instruction_index
      LIMIT ${ALLIUM_PAGE_SIZE} OFFSET ${page * ALLIUM_PAGE_SIZE}
    `);
    rows.push(...batch);
    if (batch.length < ALLIUM_PAGE_SIZE) break;
  }

  const swaps: Swap[] = [];
  const graduations = new Set<string>(); // `${txn}:${pool}` of every curve finalized at graduation
  for (const { txn_id, data } of rows) {
    const bytes = Buffer.from(base58Decode(data));
    if (bytes.subarray(0, 8).toString("hex") !== EVENT_TAG) continue;
    const discriminator = bytes.subarray(8, 16).toString("hex");
    if (discriminator === SWAPPED) swaps.push(decodeSwapped(txn_id, bytes));
    else if (discriminator === CURVE_FINALIZED) graduations.add(`${txn_id}:${base58Encode(bytes.subarray(16, 48))}`);
  }
  return { swaps, graduations };
}

// Pool account (idl/bordrless_swap.json `Pool`, after the 8-byte discriminator and 3 bump bytes):
// base_mint at 11, quote_mint at 43, then the optional hook program (tag at 171, key at 172)
async function getPools(addresses: string[]) {
  const buffers = await getAccountBuffers({ chain: "solana", accounts: addresses });
  const pools: Record<string, { base: string; quote: string; isLaunch: boolean; creatorAccounts: Set<string>; holderAccounts: Set<string> }> = {};
  addresses.forEach((address, i) => {
    const data = buffers[i];
    if (!data) throw new Error(`Bordrless pool ${address} not found`);
    const base = base58Encode(data.subarray(11, 43));
    const quote = base58Encode(data.subarray(43, 75));
    pools[address] = {
      base,
      quote,
      isLaunch: data.readUInt8(171) === 1 && base58Encode(data.subarray(172, 204)) === LAUNCH_PROGRAM,
      // A launch's creator fee accrues in the launch's quote holding, its holder rewards in the kit's reward vault.
      // Since the native-SOL migration (2026-10-15) a native launch holds them as SOL on the launch account and the
      // kit config; Swapped still names the holdings, and the accounts themselves are matched too, as Bordrless's
      // own indexer does (launchSwapCutsOf in @bordrless/sdk).
      creatorAccounts: new Set([holding(quote, launch(base)), launch(base)]),
      holderAccounts: new Set([holding(quote, kit(base)), kit(base)]),
    };
  });
  return pools;
}

export type BordrlessMarket = "launchpad" | "dex";

export async function fetchBordrless(options: FetchOptions, market: BordrlessMarket) {
  const { swaps, graduations } = await getSwaps(options);
  const pools = await getPools([...new Set(swaps.map((s) => s.pool))]);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const add = (balances: ReturnType<FetchOptions["createBalances"]>, mint: string, amount: bigint, label?: string) => {
    if (amount > 0n) balances.add(mint, amount.toString(), label);
  };

  for (const swap of swaps) {
    const pool = pools[swap.pool];
    // Launchpad: a launch pool still on its bonding curve. The buy that fills the curve graduates the coin in the
    // same transaction and counts as DEX, as do pools the launchpad did not create.
    const onCurve = pool.isLaunch && swap.virtualQuote > 0n && !graduations.has(`${swap.txn}:${swap.pool}`);
    if (onCurve !== (market === "launchpad")) continue;

    const quote = told(pool.quote);
    add(dailyVolume, quote, swap.buy ? swap.amountIn : swap.deliveredOut);

    // The protocol fee, always in the quote. The treasury spends half of it buying back $BORDR
    // (https://bordrless.app/docs/tokenomics).
    const buyback = swap.protocolFee / 2n;
    add(dailyFees, quote, swap.protocolFee, "Trading Fees");
    add(dailyRevenue, quote, swap.protocolFee, "Trading Fees To Protocol");
    add(dailyHoldersRevenue, quote, buyback, "BORDR Buy Back");
    add(dailyProtocolRevenue, quote, swap.protocolFee - buyback, "Trading Fees To Treasury");

    // The LP fee is in the input token and stays in the pool (0 on launch pools since the 2026-10-08 upgrade,
    // which moved it into the protocol fee).
    const lpMint = told(swap.buy ? pool.quote : pool.base);
    add(dailyFees, lpMint, swap.lpFee, "Trading Fees");
    add(dailySupplySideRevenue, lpMint, swap.lpFee, "LP Fees To Liquidity Providers");

    // Creator and holder fees are the hook's cuts on the quote side: from the input on a buy, the output on a sell.
    // Cuts to other holdings (custom hooks on pools the launchpad did not create) are not Bordrless fees.
    for (const delta of swap.buy ? swap.deltasIn : swap.deltasOut) {
      if (pool.creatorAccounts.has(delta.holding)) {
        add(dailyFees, quote, delta.amount, "Trading Fees");
        add(dailySupplySideRevenue, quote, delta.amount, "Creator Fees To Coin Creators");
      } else if (pool.holderAccounts.has(delta.holding)) {
        add(dailyFees, quote, delta.amount, "Trading Fees");
        add(dailySupplySideRevenue, quote, delta.amount, "Holder Reward Fees To Coin Holders");
      }
    }
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
}

export const breakdownMethodology = {
  Fees: {
    "Trading Fees": "Every fee traders pay on a trade: the Bordrless protocol fee, the LP fee kept by the pool, the fee the coin's creator set and the fee the coin sets aside for its holders.",
  },
  Revenue: { "Trading Fees To Protocol": "The protocol fee, paid to the Bordrless treasury: half is kept, half buys back $BORDR." },
  ProtocolRevenue: { "Trading Fees To Treasury": "Half of the protocol fee, kept by the treasury." },
  HoldersRevenue: { "BORDR Buy Back": "Half of the protocol fee, spent buying back $BORDR." },
  SupplySideRevenue: {
    "LP Fees To Liquidity Providers": "The LP fee, kept by the pool.",
    "Creator Fees To Coin Creators": "The creator fee, paid to the coin's creator.",
    "Holder Reward Fees To Coin Holders": "The holder reward fee, paid to the coin's holders.",
  },
};
