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
 * Two generations of the factory are LIVE and indexed together so the
 * volume series is continuous:
 *
 *   V4.5   — `0xdf4f3dB298A9aDe853191F58b4b2a322D47EC005` (deploy
 *            block 30,999,992 / 2026-04-29). Fee = 0.9 % treasury +
 *            0.1 % creator = 1.0 % total. Verified.
 *   V4.6.6 — `0x89b6b73BD18dbEA0e2218c25c1963fd5FBaB3c87` (deploy
 *            block 31,393,573). Same event ABIs; adds referral
 *            routing but trade-side events are byte-for-byte
 *            identical to V4.5.
 *
 * ── Event ABIs (confirmed identical V4.5 ⇄ V4.6.6) ─────────────────
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
 *       uint256 fee,          ← treasury + creator share, in KUB
 *       uint256 newKubRaised,
 *       uint256 price)
 *
 *   Market.TokensSold(
 *       address indexed seller,
 *       uint256 tokensIn,
 *       uint256 kubOut,       ← NET KUB the user received (fee already taken)
 *       uint256 fee,          ← treasury + creator share, in KUB
 *       uint256 newKubRaised,
 *       uint256 price)
 *
 * ── Why we enumerate markets via TokenCreated ──────────────────────
 *
 * Each BCM is a fresh contract; we discover them by scanning every
 * `TokenCreated` log emitted by either factory since genesis (NOT
 * limited to the daily window — DefiLlama's `getLogs` with no
 * fromBlock fetches the per-day window for the trade events, but we
 * need ALL historical markets so trades in surviving (pre-grad)
 * markets are still indexed today).
 */

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics"

const FACTORY_V45  = "0xdf4f3dB298A9aDe853191F58b4b2a322D47EC005";
const FACTORY_V466 = "0x89b6b73BD18dbEA0e2218c25c1963fd5FBaB3c87";

// KKUB (wrapped KUB) — the priced token DefiLlama's Bitkub oracle
// resolves. Native-KUB amounts are credited to this address.
const KKUB = "0x67eBD850304c70d983B2d1b93ea79c7CD6c3F6b5";

const TOKEN_CREATED_ABI =
  "event TokenCreated(address indexed token, address indexed market, address indexed creator, string name, string symbol, uint256 totalSupply, uint256 timestamp)";

const TOKENS_BOUGHT_ABI =
  "event TokensBought(address indexed buyer, uint256 kubIn, uint256 tokensOut, uint256 fee, uint256 newKubRaised, uint256 price)";

const TOKENS_SOLD_ABI =
  "event TokensSold(address indexed seller, uint256 tokensIn, uint256 kubOut, uint256 fee, uint256 newKubRaised, uint256 price)";

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees   = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue   = createBalances();

  // 1) Enumerate every BCM market spawned by either factory.
  const factoryLogs = await Promise.all([
    getLogs({ target: FACTORY_V45,  eventAbi: TOKEN_CREATED_ABI, onlyArgs: true, entireLog: false, fromBlock: 30_999_992, cacheInCloud: true }),
    getLogs({ target: FACTORY_V466, eventAbi: TOKEN_CREATED_ABI, onlyArgs: true, entireLog: false, fromBlock: 31_393_573, cacheInCloud: true }),
  ]);
  const markets: string[] = factoryLogs
    .flat()
    .map((l: any) => (l.market ?? l[1]) as string)
    .filter((a) => a && a !== "0x0000000000000000000000000000000000000000");

  // 2) Pull TokensBought + TokensSold from every market in the daily
  const [buys, sells] = await Promise.all([
    getLogs({ targets: markets, eventAbi: TOKENS_BOUGHT_ABI }),
    getLogs({ targets: markets, eventAbi: TOKENS_SOLD_ABI }),
  ]);

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
    Fees: "1% fee on every swap",
    Revenue: "90% of the 1% fee is kept by the protocol",
    SupplySideRevenue: "10% of the 1% fee goes to token creators",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]:    "1% fee on every swap.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]:    "90% of the 1% trading fee is kept by the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "10% of the 1% trading fee goes to token creators.",
    },
  },
};

export default adapter;
