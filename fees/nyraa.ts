/**
 * Nyraa (https://nyraa.xyz) is a memecoin launchpad on Solana. Coins launch on Meteora's Dynamic Bonding Curve (DBC)
 * program under Nyraa's own config and, once their curve is full, graduate to a Meteora DAMM v2 pool whose liquidity
 * is locked for good: half in Nyraa's position, half in the creator's.
 * Fee split as published by Nyraa: https://nyraa.xyz/whitepaper (section 4, "Fees and Revenue").
 *
 * Nyraa's configs are every DBC PoolConfig whose fee claimer is Nyraa's revenue wallet. The fee claimer is fixed when
 * a config is created, and the DBC program gives it the partner's locked LP position at graduation.
 *
 * Curve fees are read from the swap events of every transaction that references one of those configs (a DBC swap
 * always passes its pool's config). The trader pays trading_fee + protocol_fee + referral_fee: Meteora keeps the
 * protocol fee, the referral fee goes to the referrer a swap names, and the trading fee is split between the coin's
 * creator (the config's creator_trading_fee_percentage, 50 in Nyraa's config) and Nyraa.
 * Graduated pools: the fees Nyraa's locked positions earn are counted when Nyraa claims them.
 *
 * Solana is read through RPC signatures rather than Dune or Allium: Nyraa has three coins and about 2,200
 * transactions since its launch on 2026-10-28.
 */
import { createHash } from "crypto";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { base58Decode, base58Encode, findProgramAddress, getAccountBuffers, getProgramAccounts, solanaRpc } from "../helpers/solana";

// Nyraa's revenue wallet, and the fee claimer of its DBC configs
// https://solscan.io/account/HB62sq7jc85nGZMAMZZRa6pyWU1k2FniZdN1Qy7q3L4b
const FEE_CLAIMER = "HB62sq7jc85nGZMAMZZRa6pyWU1k2FniZdN1Qy7q3L4b";
const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const DAMM_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Anchor discriminators: the first 8 bytes of sha256("account:<Name>") or sha256("event:<Name>")
const discriminator = (kind: "account" | "event", name: string) => createHash("sha256").update(`${kind}:${name}`).digest().subarray(0, 8);
const POOL_CONFIG = discriminator("account", "PoolConfig");
const VIRTUAL_POOL = discriminator("account", "VirtualPool");
const POSITION = discriminator("account", "Position");
const EVT_SWAP2 = discriminator("event", "EvtSwap2");
const EVT_SWAP3 = discriminator("event", "EvtSwap3");
const EVT_CLAIM_POSITION_FEE = discriminator("event", "EvtClaimPositionFee");
// Meteora emits its events with emit_cpi!, as calls to itself: this 8-byte tag, the event's discriminator, the Borsh body
const EVENT_CPI_TAG = Buffer.from("e445a52e51cb9a1d", "hex");
// Event lengths in bytes, tag and discriminator included
const EVT_SWAP2_LENGTH = 195;
const EVT_SWAP3_LENGTH = 172;
const EVT_CLAIM_POSITION_FEE_LENGTH = 128;

// Fees are counted in a config's quote token when it is one of these. Nyraa's config is quoted in SOL.
const QUOTE_MINTS = [ADDRESSES.solana.SOL, ADDRESSES.solana.USDC];

const LABELS = {
  CURVE_FEES: "Bonding Curve Trading Fees",
  LP_FEES: "Graduated Pool LP Fees",
  CURVE_FEES_TO_NYRAA: "Bonding Curve Trading Fees To Nyraa",
  LP_FEES_TO_NYRAA: "Graduated Pool LP Fees To Nyraa",
  CURVE_FEES_TO_CREATORS: "Bonding Curve Trading Fees To Creators",
  CURVE_FEES_TO_METEORA: "Bonding Curve Trading Fees To Meteora",
  CURVE_FEES_TO_REFERRALS: "Bonding Curve Trading Fees To Referrals",
};

const toHex = (address: string) => Buffer.from(base58Decode(address)).toString("hex");

type Config = { quoteMint: string; creatorPercentage: bigint };

// A refill, or the 24 hourly slices of a test, runs many windows in one process. What was read after a window had
// ended still holds for it (a config is immutable, a locked position stays where it is), so such a read is reused
// instead of asking the RPC again. Old signature pages and transactions never change and are kept the same way.
const asOf = <T>(load: (windowEnd: number) => Promise<T>) => {
  let readAt = 0;
  let value: Promise<T> | undefined;
  return (windowEnd: number): Promise<T> => {
    if (!value || readAt < windowEnd) {
      readAt = Math.floor(Date.now() / 1000);
      value = load(windowEnd).catch((e) => {
        value = undefined;
        throw e;
      });
    }
    return value;
  };
};

// Nyraa's DBC configs, by fee claimer.
// DBC PoolConfig (idls/dynamic_bonding_curve.json): quote_mint at 8, fee_claimer at 40,
// creator_trading_fee_percentage at 245. A config is immutable, so its current values apply to every past swap.
const getConfigs = asOf(async (): Promise<Record<string, Config>> => {
  const accounts = await getProgramAccounts({
    programId: DBC_PROGRAM,
    encoding: "base64",
    filters: [
      { memcmp: { offset: 0, bytes: base58Encode(POOL_CONFIG) } },
      { memcmp: { offset: 40, bytes: FEE_CLAIMER } },
    ],
  });
  if (!accounts.length) throw new Error("nyraa: no DBC config found for the fee claimer");
  const configs: Record<string, Config> = {};
  accounts.forEach(({ pubkey, account }) => {
    const data = Buffer.from(account.data[0], "base64");
    configs[pubkey] = { quoteMint: base58Encode(data.subarray(8, 40)), creatorPercentage: BigInt(data.readUInt8(245)) };
  });
  return configs;
});

// A page of signatures older than `before` never changes; only the newest page does
const signaturePages = new Map<string, Promise<any[]>>();
const getSignaturePage = (address: string, before?: string): Promise<any[]> => {
  const load = (): Promise<any[]> => solanaRpc("getSignaturesForAddress", [address, { before, limit: 1000, commitment: "finalized" }]);
  if (!before) return load();
  const key = `${address}:${before}`;
  if (!signaturePages.has(key))
    signaturePages.set(key, load().catch((e: any) => { signaturePages.delete(key); throw e; }));
  return signaturePages.get(key)!;
};

// Successful transactions that reference `address`, with blockTime in [from, to); newest first from the tip.
const getSignatures = async (address: string, from: number, to: number): Promise<string[]> => {
  const signatures: string[] = [];
  let before: string | undefined;
  for (;;) {
    // Finalized only: a finalized signature carries its blockTime
    const page = await getSignaturePage(address, before);
    if (!Array.isArray(page)) throw new Error(`nyraa: getSignaturesForAddress returned no list for ${address}`);
    // Every address read here has transactions, so an empty first page is an RPC without that history
    if (!page.length && !before) throw new Error(`nyraa: the RPC has no transactions for ${address}`);
    if (!page.length) return signatures;
    for (const s of page) {
      if (!s.blockTime) throw new Error(`nyraa: signature ${s.signature} has no blockTime`);
      if (!s.err && s.blockTime >= from && s.blockTime < to) signatures.push(s.signature);
    }
    const oldest = page[page.length - 1];
    if (page.length < 1000 || oldest.blockTime < from) return signatures;
    before = oldest.signature;
  }
};

// The events Meteora's two programs emitted in a transaction, by program. An emit_cpi! event is an inner instruction
// of the program to itself, signed by its event authority, so no other program can produce one.
// A transaction never changes: each one is read once per process, and only its events are kept.
type Events = Record<string, Buffer[]>;
const eventsOfTransaction = new Map<string, Promise<Events>>();
const readEvents = async (signature: string): Promise<Events> => {
  // Mainnet has version 1 transactions: with a lower maximum the RPC refuses to return them
  const tx = await solanaRpc("getTransaction", [signature, { encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 1 }]);
  if (!tx?.meta) throw new Error(`nyraa: transaction ${signature} not available`);
  const events: Events = { [DBC_PROGRAM]: [], [DAMM_PROGRAM]: [] };
  if (tx.meta.err) return events;
  const keys: string[] = [
    ...tx.transaction.message.accountKeys,
    ...(tx.meta.loadedAddresses?.writable ?? []),
    ...(tx.meta.loadedAddresses?.readonly ?? []),
  ];
  for (const group of tx.meta.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      const ofProgram = events[keys[ix.programIdIndex]];
      if (!ofProgram) continue;
      const data = Buffer.from(base58Decode(ix.data));
      if (data.length >= 16 && data.subarray(0, 8).equals(EVENT_CPI_TAG)) ofProgram.push(data);
    }
  }
  return events;
};
const getEvents = async (signature: string, program: string): Promise<Buffer[]> => {
  if (!eventsOfTransaction.has(signature))
    eventsOfTransaction.set(signature, readEvents(signature).catch((e: any) => { eventsOfTransaction.delete(signature); throw e; }));
  return (await eventsOfTransaction.get(signature)!)[program];
};

type CurveFee = { config: string; trading: bigint; creator: bigint; protocol: bigint; referral: bigint };

// The fees of the swaps on Nyraa's curves in one transaction.
// A DBC swap emits EvtSwap, EvtSwap2 and EvtSwap3 for the same trade, so only EvtSwap3 is counted; EvtSwap2 is read
// only to check that every trade still has its EvtSwap3.
// EvtSwap2 and EvtSwap3: pool at 16, config at 48. EvtSwap3: fee_on_base_token at 83, trading_fee at 116,
// protocol_fee at 124, referral_fee at 132.
// The creator's share is worked out swap by swap, so hourly windows add up to exactly what a daily window gives.
const getCurveFees = async (signature: string, configs: Record<string, Config>, configByHex: Record<string, string>): Promise<CurveFee[]> => {
  const fees: CurveFee[] = [];
  let swap2 = 0;
  let swap3 = 0;
  for (const data of await getEvents(signature, DBC_PROGRAM)) {
    const event = data.subarray(8, 16);
    const isSwap2 = event.equals(EVT_SWAP2);
    const isSwap3 = event.equals(EVT_SWAP3);
    if (!isSwap2 && !isSwap3) continue;
    if (data.length !== (isSwap2 ? EVT_SWAP2_LENGTH : EVT_SWAP3_LENGTH))
      throw new Error(`nyraa: Meteora swap event with an unknown layout in ${signature}, the program was likely upgraded`);
    // a swap on another launchpad's curve in the same transaction is not Nyraa's
    const config = configByHex[data.subarray(48, 80).toString("hex")];
    if (!config) continue;
    if (isSwap2) {
      swap2++;
      continue;
    }
    swap3++;
    // Fees charged in the coin itself are left out. Nyraa's config collects fees in the quote token only.
    if (data.readUInt8(83) !== 0) continue;
    const trading = data.readBigUInt64LE(116);
    fees.push({
      config,
      trading,
      creator: (trading * configs[config].creatorPercentage) / 100n,
      protocol: data.readBigUInt64LE(124),
      referral: data.readBigUInt64LE(132),
    });
  }
  if (swap2 !== swap3) throw new Error(`nyraa: DBC swaps in ${signature} do not emit one EvtSwap3 per EvtSwap2`);
  return fees;
};

// Nyraa's LP positions in the DAMM v2 pools its coins graduated to, each with its pool's quote token. At graduation
// the DBC program locks the partner's share of the liquidity in a position whose NFT (Token-2022, amount 1) goes to
// the config's fee claimer.
const readPositions = async (configs: Record<string, Config>): Promise<Record<string, string>> => {
  // SPL token account: mint at 0, amount at 64
  const tokenAccounts = await solanaRpc("getTokenAccountsByOwner", [FEE_CLAIMER, { programId: TOKEN_2022_PROGRAM }, { encoding: "base64" }]);
  const candidates: string[] = tokenAccounts.value
    .map((account: any) => Buffer.from(account.account.data[0], "base64"))
    .filter((data: Buffer) => data.readBigUInt64LE(64) === 1n)
    .map((data: Buffer) => findProgramAddress([Buffer.from("position"), data.subarray(0, 32)], DAMM_PROGRAM)[0]);
  if (!candidates.length) return {};

  // DAMM v2 Position (idls/cp_amm.json): pool at 8. A Token-2022 NFT that is not a position has no such account.
  const positionBuffers = await getAccountBuffers({ chain: "solana", accounts: candidates });
  const poolOfPosition: Record<string, string> = {};
  positionBuffers.forEach((data, i) => {
    if (data && data.subarray(0, 8).equals(POSITION)) poolOfPosition[candidates[i]] = base58Encode(data.subarray(8, 40));
  });
  const pools = [...new Set(Object.values(poolOfPosition))];
  if (!pools.length) return {};

  // The coins launched under Nyraa's configs, each with its config's quote token.
  // DBC VirtualPool (idls/dynamic_bonding_curve.json): config at 72, base_mint at 136
  const quoteOfCoin: Record<string, string> = {};
  for (const [config, { quoteMint }] of Object.entries(configs)) {
    const curves = await getProgramAccounts({
      programId: DBC_PROGRAM,
      encoding: "base64",
      dataSlice: { offset: 136, length: 32 },
      filters: [
        { memcmp: { offset: 0, bytes: base58Encode(VIRTUAL_POOL) } },
        { memcmp: { offset: 72, bytes: config } },
      ],
    });
    curves.forEach(({ account }) => { quoteOfCoin[base58Encode(Buffer.from(account.data[0], "base64"))] = quoteMint; });
  }

  // DAMM v2 Pool (idls/cp_amm.json): token_a_mint at 168, token_b_mint at 200. A pool migrated from DBC has the coin
  // as token A and the quote token as token B. Positions in any other pool are not launchpad positions.
  const poolBuffers = await getAccountBuffers({ chain: "solana", accounts: pools });
  const quoteOfPool: Record<string, string> = {};
  pools.forEach((pool, i) => {
    const data = poolBuffers[i];
    if (!data) throw new Error(`nyraa: DAMM v2 pool ${pool} not found`);
    const quoteMint = quoteOfCoin[base58Encode(data.subarray(168, 200))];
    if (quoteMint && quoteMint === base58Encode(data.subarray(200, 232))) quoteOfPool[pool] = quoteMint;
  });

  const positions: Record<string, string> = {};
  Object.entries(poolOfPosition).forEach(([position, pool]) => {
    if (quoteOfPool[pool]) positions[position] = quoteOfPool[pool];
  });
  return positions;
};
const getPositions = asOf(async (windowEnd: number) => readPositions(await getConfigs(windowEnd)));

// The quote-token fees Nyraa claimed from one of its positions in a transaction.
// DAMM v2 EvtClaimPositionFee: pool at 16, position at 48, owner at 80, fee_a_claimed at 112, fee_b_claimed at 120.
// Token B is the quote token, so fee_b_claimed is the quote-side fee; fees claimed in the coin are left out.
const getClaimedLpFees = async (signature: string, position: string): Promise<bigint> => {
  let claimed = 0n;
  for (const data of await getEvents(signature, DAMM_PROGRAM)) {
    if (!data.subarray(8, 16).equals(EVT_CLAIM_POSITION_FEE)) continue;
    if (data.length !== EVT_CLAIM_POSITION_FEE_LENGTH)
      throw new Error(`nyraa: Meteora claim event with an unknown layout in ${signature}, the program was likely upgraded`);
    if (data.subarray(48, 80).toString("hex") !== toHex(position)) continue;
    if (data.subarray(80, 112).toString("hex") !== toHex(FEE_CLAIMER)) continue;
    claimed += data.readBigUInt64LE(120);
  }
  return claimed;
};

const fetch = async (options: FetchOptions) => {
  const from = options.startTimestamp;
  const to = options.endTimestamp;
  const configs = await getConfigs(to);
  const configByHex: Record<string, string> = {};
  Object.keys(configs).forEach((config) => { configByHex[toHex(config)] = config; });

  // Bonding curves
  const signatures = new Set<string>();
  for (const config of Object.keys(configs)) (await getSignatures(config, from, to)).forEach((s) => signatures.add(s));
  // One transaction at a time: a public RPC answers 429 to parallel getTransaction calls
  const curveFees: CurveFee[] = [];
  for (const signature of signatures) curveFees.push(...(await getCurveFees(signature, configs, configByHex)));

  const curve: Record<string, { trading: bigint; creator: bigint; protocol: bigint; referral: bigint }> = {};
  curveFees.forEach(({ config, trading, creator, protocol, referral }) => {
    const sum = (curve[config] ??= { trading: 0n, creator: 0n, protocol: 0n, referral: 0n });
    sum.trading += trading;
    sum.creator += creator;
    sum.protocol += protocol;
    sum.referral += referral;
  });

  // Graduated pools
  const lpFees: Record<string, bigint> = {};
  for (const [position, quoteMint] of Object.entries(await getPositions(to))) {
    for (const signature of await getSignatures(position, from, to))
      lpFees[quoteMint] = (lpFees[quoteMint] ?? 0n) + await getClaimedLpFees(signature, position);
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  Object.entries(curve).forEach(([config, { trading, creator, protocol, referral }]) => {
    const { quoteMint } = configs[config];
    if (!QUOTE_MINTS.includes(quoteMint)) return;
    dailyFees.add(quoteMint, (trading + protocol + referral).toString(), LABELS.CURVE_FEES);
    dailyRevenue.add(quoteMint, (trading - creator).toString(), LABELS.CURVE_FEES_TO_NYRAA);
    dailySupplySideRevenue.add(quoteMint, creator.toString(), LABELS.CURVE_FEES_TO_CREATORS);
    dailySupplySideRevenue.add(quoteMint, protocol.toString(), LABELS.CURVE_FEES_TO_METEORA);
    dailySupplySideRevenue.add(quoteMint, referral.toString(), LABELS.CURVE_FEES_TO_REFERRALS);
  });
  Object.entries(lpFees).forEach(([quoteMint, fees]) => {
    if (!QUOTE_MINTS.includes(quoteMint)) return;
    dailyFees.add(quoteMint, fees.toString(), LABELS.LP_FEES);
    dailyRevenue.add(quoteMint, fees.toString(), LABELS.LP_FEES_TO_NYRAA);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by traders on the bonding curves of coins launched on Nyraa, and the fees Nyraa's locked liquidity earns in graduated Meteora DAMM v2 pools, counted when claimed. Excludes the flat 0.005 SOL launch fee and the 0.25% interface fee on token buys and sells made in Nyraa's app.",
  UserFees: "Trading fees paid by traders on the bonding curves of coins launched on Nyraa, and the fees Nyraa's locked liquidity earns in graduated Meteora DAMM v2 pools, counted when claimed.",
  Revenue: "Nyraa's share of bonding-curve trading fees, which is what is left after Meteora's protocol fee, referral fees and the coin creator's share, plus the fees its locked liquidity earns in graduated pools.",
  ProtocolRevenue: "All of Nyraa's share of bonding-curve trading fees and graduated-pool fees, sent to Nyraa's revenue wallet. None of it is used for NYRAA buybacks or burns.",
  SupplySideRevenue: "Bonding-curve trading fees paid to coin creators (their configured share of the trading fee, 50% in Nyraa's config), to Meteora (its protocol fee) and to referrers.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CURVE_FEES]: "Trading fees paid on Nyraa bonding curves: the creator, Nyraa, Meteora and referral shares together. The base fee is 1%; it starts at 50% and decays to 1% over a coin's first 60 seconds.",
    [LABELS.LP_FEES]: "Fees that Nyraa's locked LP position earns in Meteora DAMM v2 pools of graduated coins, counted when Nyraa claims them.",
  },
  UserFees: {
    [LABELS.CURVE_FEES]: "Trading fees paid on Nyraa bonding curves: the creator, Nyraa, Meteora and referral shares together. The base fee is 1%; it starts at 50% and decays to 1% over a coin's first 60 seconds.",
    [LABELS.LP_FEES]: "Fees that Nyraa's locked LP position earns in Meteora DAMM v2 pools of graduated coins, counted when Nyraa claims them.",
  },
  Revenue: {
    [LABELS.CURVE_FEES_TO_NYRAA]: "Nyraa's share of the bonding-curve trading fee, after the coin creator's share.",
    [LABELS.LP_FEES_TO_NYRAA]: "Fees claimed from Nyraa's locked LP positions in graduated DAMM v2 pools.",
  },
  ProtocolRevenue: {
    [LABELS.CURVE_FEES_TO_NYRAA]: "Nyraa's share of the bonding-curve trading fee, sent to Nyraa's revenue wallet.",
    [LABELS.LP_FEES_TO_NYRAA]: "Fees claimed from Nyraa's locked LP positions in graduated DAMM v2 pools, sent to Nyraa's revenue wallet.",
  },
  SupplySideRevenue: {
    [LABELS.CURVE_FEES_TO_CREATORS]: "The coin creator's configured share of the bonding-curve trading fee.",
    [LABELS.CURVE_FEES_TO_METEORA]: "Meteora's protocol fee on bonding-curve swaps.",
    [LABELS.CURVE_FEES_TO_REFERRALS]: "The part of Meteora's protocol fee paid to the referrer of a swap, when the swap names one.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-28", // Nyraa's config was created on 2026-10-28 07:39 UTC, its first coin the same day
  doublecounted: true, // Nyraa coins trade on Meteora DBC curves and DAMM v2 pools, also counted on Meteora's listings
  methodology,
  breakdownMethodology,
};

export default adapter;
