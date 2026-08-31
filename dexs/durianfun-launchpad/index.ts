/**
 * Durianfun Launchpad — bonding-curve DEX adapter.
 *
 * PR target: https://github.com/DefiLlama/dimension-adapters
 * Final path: `dexs/durianfun-launchpad/index.ts`
 *
 * ── Protocol ───────────────────────────────────────────────────────
 *
 * Durianfun is a pump.fun-style exponential bonding-curve launchpad
 * on Bitkub Chain (chainId 96). Each token launched by the factory
 * spawns its own `BondingCurveMarket` contract that price-discovers
 * via a sealed reserve until the graduation threshold, after which
 * liquidity is migrated to a `DurianAMM` pool (covered by a separate
 * adapter, `durian-amm`).
 *
 * Four generations of the factory are LIVE and indexed together so the
 * volume series is continuous:
 *
 *   V4.5   — `0xdf4f3dB298A9aDe853191F58b4b2a322D47EC005` (deploy
 *            block 30,999,992 / 2026-04-29). Fee = 0.9 % treasury +
 *            0.1 % creator = 1.0 % total. Verified.
 *   V4.6.6 — `0x89b6b73BD18dbEA0e2218c25c1963fd5FBaB3c87` (deploy
 *            block 31,393,573). Same event ABIs; adds referral
 *            routing but trade-side events are byte-for-byte
 *            identical to V4.5.
 *   V4.6.7 — `0x0480017E51dC813a0fad8aA73EAb2f8476ac0e8F` (deploy
 *            block 32,196,516 / 2026-05-31). Dual graduation:
 *            in-contract Durian AMM or an external KUBLERX V3 pool.
 *            TokensBought / TokensSold are byte-identical to V4.5 /
 *            V4.6.6; only `TokenCreated` differs (appends
 *            `uint8 graduationTarget`), so V4.6.7 markets are
 *            discovered with an 8-arg ABI.
 *   V5     — `0xE3861e300043d8c20A927340cbA6379D0BECb793` (deploy
 *            block 34,014,875 / 2026-08-12). Current production
 *            launchpad. Every new coin launches here. Trade events and
 *            `TokenCreated` are byte-identical to V4.6.7 (same event
 *            hashes), but the FEE SCHEDULE is different — see below —
 *            so V5 markets are summed in their own pass.
 *
 * ── Fee schedules ──────────────────────────────────────────────────
 *
 *   V4.5 / V4.6.6 / V4.6.7 : 1.0 % of gross notional
 *                            → 90 % treasury, 10 % creator.
 *
 *   V5                     : 1.167 % of gross notional (11 670 ppm,
 *                            read back on-chain from
 *                            `market.totalFeePpm()`), split by the
 *                            contract as
 *                              treasury 10 000 ppm  (85.69 % of the fee)
 *                              referral  1 000 ppm  ( 8.57 % of the fee)
 *                              creator     670 ppm  ( 5.74 % of the fee)
 *                            The referral slice is routed to the
 *                            TREASURY unless the on-chain volume
 *                            registry marks the trade's referrer
 *                            eligible, in which case the market emits
 *                            `ReferralPaid`. So protocol revenue is
 *                            `fee − creatorPart − Σ ReferralPaid`, and
 *                            we sum `ReferralPaid` rather than assuming
 *                            either extreme.
 *
 * The adapter never hardcodes a rate against the volume — it reads the
 * `fee` field emitted by each trade — the ppm constants are only used
 * to split an already-collected fee between recipients.
 *
 * ── Event ABIs (trade events identical V4.5 → V5) ──────────────────
 *
 *   Factory.TokenCreated(
 *       address indexed token,
 *       address indexed market,
 *       address indexed creator,
 *       string name, string symbol,
 *       uint256 totalSupply, uint256 timestamp)
 *
 *   Market.TokensBought(
 *       address indexed buyer,
 *       uint256 kubIn,        ← gross KUB spent (includes fee)
 *       uint256 tokensOut,
 *       uint256 fee,          ← treasury + creator (+ referral on V5), in KUB
 *       uint256 newKubRaised,
 *       uint256 price)
 *
 *   Market.TokensSold(
 *       address indexed seller,
 *       uint256 tokensIn,
 *       uint256 kubOut,       ← NET KUB the user received (fee already taken)
 *       uint256 fee,          ← treasury + creator (+ referral on V5), in KUB
 *       uint256 newKubRaised,
 *       uint256 price)
 *
 *   Market.ReferralPaid(     ← V5 only, emitted in the same tx as the trade
 *       address indexed user,
 *       address indexed referrer,
 *       uint256 amount)      ← KUB actually paid out to an external referrer
 *
 * ── Why we enumerate markets via TokenCreated ──────────────────────
 *
 * Each BCM is a fresh contract; we discover them by scanning every
 * `TokenCreated` log emitted by each factory since its deploy block (NOT
 * limited to the daily window — DefiLlama's `getLogs` with no
 * fromBlock fetches the per-day window for the trade events, but we
 * need ALL historical markets so trades in surviving (pre-grad)
 * markets are still indexed today).
 */

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics"
import { ethers } from "ethers";

const FACTORY_V45  = "0xdf4f3dB298A9aDe853191F58b4b2a322D47EC005";
const FACTORY_V466 = "0x89b6b73BD18dbEA0e2218c25c1963fd5FBaB3c87";
const FACTORY_V467 = "0x0480017E51dC813a0fad8aA73EAb2f8476ac0e8F";
const FACTORY_V5   = "0xE3861e300043d8c20A927340cbA6379D0BECb793"; // current prod launchpad (2026-08-12)

// KKUB (wrapped KUB) — the priced token DefiLlama's Bitkub oracle
// resolves. Native-KUB amounts are credited to this address.
const KKUB = "0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5";

const ZERO = "0x0000000000000000000000000000000000000000";

const TOKEN_CREATED_ABI =
  "event TokenCreated(address indexed token, address indexed market, address indexed creator, string name, string symbol, uint256 totalSupply, uint256 timestamp)";

// V4.6.7 appends a trailing `uint8 graduationTarget`, changing the TokenCreated
// event hash — its markets must be discovered with this 8-arg ABI (the 7-arg ABI
// above matches zero V4.6.7 events). V5 emits the byte-identical event, so it
// shares this ABI. The TRADE events (TokensBought/TokensSold) are byte-identical
// across all four generations and reuse the ABIs below.
const TOKEN_CREATED_ABI_V467 =
  "event TokenCreated(address indexed token, address indexed market, address indexed creator, string name, string symbol, uint256 totalSupply, uint256 timestamp, uint8 graduationTarget)";

const TOKENS_BOUGHT_ABI =
  "event TokensBought(address indexed buyer, uint256 kubIn, uint256 tokensOut, uint256 fee, uint256 newKubRaised, uint256 price)";

const TOKENS_SOLD_ABI =
  "event TokensSold(address indexed seller, uint256 tokensIn, uint256 kubOut, uint256 fee, uint256 newKubRaised, uint256 price)";

// V5 only — the referral slice actually paid out to an external referrer.
const REFERRAL_PAID_ABI =
  "event ReferralPaid(address indexed user, address indexed referrer, uint256 amount)";

// V5 fee split, in ppm of the 11 670 ppm total fee (see header).
const V5_TOTAL_FEE_PPM   = 11670n;
const V5_CREATOR_FEE_PPM = 670n;

const toMarkets = (logs: any[]): string[] =>
  logs
    .map((l: any) => (l.market ?? l[1]) as string)
    .filter((a) => a && a !== ZERO);

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees   = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue   = createBalances();

  // 1) Enumerate every BCM market spawned by each factory. V5 is kept in its
  //    own list because its fee split differs from the earlier generations.
  const [logsV45, logsV466, logsV467, logsV5] = await Promise.all([
    getLogs({ target: FACTORY_V45,  eventAbi: TOKEN_CREATED_ABI,      onlyArgs: true, entireLog: false, fromBlock: 30_999_992, cacheInCloud: true }),
    getLogs({ target: FACTORY_V466, eventAbi: TOKEN_CREATED_ABI,      onlyArgs: true, entireLog: false, fromBlock: 31_393_573, cacheInCloud: true }),
    getLogs({ target: FACTORY_V467, eventAbi: TOKEN_CREATED_ABI_V467, onlyArgs: true, entireLog: false, fromBlock: 32_196_516, cacheInCloud: true }),
    getLogs({ target: FACTORY_V5,   eventAbi: TOKEN_CREATED_ABI_V467, onlyArgs: true, entireLog: false, fromBlock: 34_014_875, cacheInCloud: true }),
  ]);
  const markets   = toMarkets([...logsV45, ...logsV466, ...logsV467]);
  const marketsV5 = toMarkets(logsV5);

  // 2) Pull TokensBought + TokensSold for the window, then split them by
  //    market. V5 additionally needs ReferralPaid to know how much of the fee
  //    actually left the treasury.
  //
  //    ONE CHAIN-WIDE SCAN PER EVENT, NOT ONE PER MARKET. `targets` issues a
  //    separate query per address: 96 markets x 2 events + 11 V5 markets x 3
  //    = 225 queries per run, and this adapter is `pullHourly`, so ~5.4k a day.
  //    Bitkub's public RPCs will not carry that — measured 2026-08-31, every
  //    one of DefiLlama's three KUB hosts answered 429 and the run died with
  //    'Aborting, previous errors in promise pool'. This adapter has reported
  //    nothing since 2026-08-23 for that reason, while real trades continued
  //    daily. Three scans cost the same whether there are 96 markets or 960,
  //    so it also stops the problem coming back as the launchpad grows.
  //    Same approach as dexs/aborean-cl and dexs/aerodrome-slipstream.
  const marketSet   = new Set(markets.map((a) => a.toLowerCase()));
  const marketV5Set = new Set(marketsV5.map((a) => a.toLowerCase()));

  const [boughtRaw, soldRaw, referralRaw] = await Promise.all([
    getLogs({ noTarget: true, eventAbi: TOKENS_BOUGHT_ABI, entireLog: true }),
    getLogs({ noTarget: true, eventAbi: TOKENS_SOLD_ABI,   entireLog: true }),
    marketV5Set.size ? getLogs({ noTarget: true, eventAbi: REFERRAL_PAID_ABI, entireLog: true }) : [],
  ]);

  // A chain-wide scan sees every contract that happens to emit the same
  // signature, so the address filter is what makes these OUR trades — it is
  // load-bearing, not a tidy-up. `ReferralPaid(address,address,uint256)` in
  // particular is a name any protocol might use.
  const ifaceBought   = new ethers.Interface([TOKENS_BOUGHT_ABI]);
  const ifaceSold     = new ethers.Interface([TOKENS_SOLD_ABI]);
  const ifaceReferral = new ethers.Interface([REFERRAL_PAID_ABI]);

  const split = (logs: any[], set: Set<string>, other: Set<string>, iface: ethers.Interface) => {
    const mine: any[] = [], theirs: any[] = [];
    for (const log of logs) {
      const addr = String(log.address ?? log.source ?? '').toLowerCase();
      const bucket = set.has(addr) ? mine : other.has(addr) ? theirs : null;
      if (!bucket) continue;
      let parsed: any;
      try { parsed = iface.parseLog(log); } catch { continue; }
      if (!parsed) continue;
      bucket.push(parsed.args);
    }
    return [mine, theirs] as const;
  };

  // `markets` (pre-V5 fee split) and `marketsV5` are disjoint, so one pass
  // over each log set fills both buckets.
  const [buys,  buysV5]  = split(boughtRaw, marketSet, marketV5Set, ifaceBought);
  const [sells, sellsV5] = split(soldRaw,   marketSet, marketV5Set, ifaceSold);
  const [, referralsV5]  = split(referralRaw, new Set<string>(), marketV5Set, ifaceReferral);

  for (const log of buys) {
    // Gross KUB volume — `kubIn` already includes the fee.
    const kubIn = BigInt((log as any).kubIn);
    const fee = BigInt((log as any).fee);
    const treasury = (fee * 9n) / 10n;  
    dailyVolume.add(KKUB, kubIn);
    dailyFees.add(KKUB,fee, METRIC.SWAP_FEES);
    dailyRevenue.add(KKUB, treasury, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(KKUB, fee - treasury, METRIC.CREATOR_FEES);
  }

  for (const log of sells) {
    // `kubOut` is NET (post-fee). Gross = kubOut + fee.
    const kubOut = BigInt((log as any).kubOut);
    const fee    = BigInt((log as any).fee);
    const treasury = (fee * 9n) / 10n;
    dailyVolume.add(KKUB, (kubOut + fee));
    dailyFees.add(KKUB, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(KKUB, treasury, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(KKUB, fee - treasury, METRIC.CREATOR_FEES);
  }

  // 3) V5 pass — same event shapes, different split. Accumulated as bigints
  //    first so the referral subtraction never has to add a negative balance.
  let v5Volume = 0n;
  let v5Fees   = 0n;
  let v5Creator = 0n;

  for (const log of buysV5) {
    const kubIn = BigInt((log as any).kubIn);
    const fee   = BigInt((log as any).fee);
    v5Volume  += kubIn;                                          // `kubIn` is gross
    v5Fees    += fee;
    v5Creator += (fee * V5_CREATOR_FEE_PPM) / V5_TOTAL_FEE_PPM;  // mirrors the contract's integer math
  }

  for (const log of sellsV5) {
    const kubOut = BigInt((log as any).kubOut);
    const fee    = BigInt((log as any).fee);
    v5Volume  += kubOut + fee;                                   // `kubOut` is NET
    v5Fees    += fee;
    v5Creator += (fee * V5_CREATOR_FEE_PPM) / V5_TOTAL_FEE_PPM;
  }

  // The referral slice defaults to the treasury; only the amounts in
  // ReferralPaid actually left the protocol.
  let v5Referral = 0n;
  for (const log of referralsV5) v5Referral += BigInt((log as any).amount);

  if (v5Fees > 0n) {
    let v5Protocol = v5Fees - v5Creator - v5Referral;
    if (v5Protocol < 0n) v5Protocol = 0n;                        // defensive: window-edge ReferralPaid
    dailyVolume.add(KKUB, v5Volume);
    dailyFees.add(KKUB, v5Fees, METRIC.SWAP_FEES);
    dailyRevenue.add(KKUB, v5Protocol, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(KKUB, v5Creator, METRIC.CREATOR_FEES);
    if (v5Referral > 0n) dailySupplySideRevenue.add(KKUB, v5Referral, METRIC.OPERATORS_FEES);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      start: "2026-04-29",
    },
  },
  methodology: {
    Volume: `Sum of gross KUB notional from every TokensBought / TokensSold event emitted by BondingCurveMarket contracts`,
    Fees: "1% fee on every swap (1.167% on the V5 launchpad)",
    Revenue: "90% of the 1% fee is kept by the protocol (on V5: 85.7% of the 1.167% fee, plus the 8.6% referral slice whenever no eligible referrer is paid)",
    SupplySideRevenue: "10% of the 1% fee goes to token creators (on V5: 5.7% to creators and up to 8.6% to referrers)",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]:    "1% fee on every swap; 1.167% on markets launched by the V5 factory.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]:    "90% of the 1% trading fee is kept by the protocol. On V5 the protocol keeps the fee minus the creator share, minus any referral actually paid out.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "10% of the 1% trading fee goes to token creators; 5.7% of the 1.167% fee on V5.",
      [METRIC.OPERATORS_FEES]: "V5 only: the 8.6% referral slice of the trading fee, when an eligible referrer is paid (otherwise it is routed to the treasury and counted as revenue).",
    },
  },
};

export default adapter;
