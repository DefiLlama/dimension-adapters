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
 * ── Volume / Fees methodology ──────────────────────────────────────
 *
 *   dailyVolume  = Σ buy.kubIn  +  Σ (sell.kubOut + sell.fee)
 *                  (gross KUB notional, matching the convention used
 *                   by Uniswap-style adapters in this repo)
 *   dailyFees    = Σ buy.fee    +  Σ sell.fee
 *   dailyRevenue = dailyFees                ← 100 % captured by the
 *                                              project treasury +
 *                                              token creator; no LP
 *                                              and no governance
 *                                              token to dilute.
 *
 * Amounts are denominated in native KUB; we credit them to KKUB
 * (0x67eBD8…F6b5) so DefiLlama's per-chain oracle prices them in USD.
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

  // 1) Enumerate every BCM market spawned by either factory.
  //    `fromBlock: 0` here means "from each factory's deploy block";
  //    the dimension-adapters helper handles per-chain genesis offsets,
  //    but we pass `entireLog: true` so we get all historical markets,
  //    not just today's freshly-created ones.
  const factoryLogs = await Promise.all([
    getLogs({ target: FACTORY_V45,  eventAbi: TOKEN_CREATED_ABI, onlyArgs: true, entireLog: false, fromBlock: 30_999_992 }),
    getLogs({ target: FACTORY_V466, eventAbi: TOKEN_CREATED_ABI, onlyArgs: true, entireLog: false, fromBlock: 31_393_573 }),
  ]);
  const markets: string[] = factoryLogs
    .flat()
    .map((l: any) => (l.market ?? l[1]) as string)
    .filter((a) => a && a !== "0x0000000000000000000000000000000000000000");

  if (markets.length === 0) {
    return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
  }

  // 2) Pull TokensBought + TokensSold from every market in the daily
  //    window. `getLogs` with `targets:` fans out across markets and
  //    transparently chunks per-RPC limits.
  const [buys, sells] = await Promise.all([
    getLogs({ targets: markets, eventAbi: TOKENS_BOUGHT_ABI }),
    getLogs({ targets: markets, eventAbi: TOKENS_SOLD_ABI }),
  ]);

  for (const log of buys) {
    // Gross KUB volume — `kubIn` already includes the fee.
    dailyVolume.add(KKUB, (log as any).kubIn);
    dailyFees.add(KKUB,   (log as any).fee);
  }

  for (const log of sells) {
    // `kubOut` is NET (post-fee). Gross = kubOut + fee.
    const kubOut = BigInt((log as any).kubOut.toString());
    const fee    = BigInt((log as any).fee.toString());
    dailyVolume.add(KKUB, (kubOut + fee).toString());
    dailyFees.add(KKUB,   fee.toString());
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      // First V4.5 market was created at block 30,999,992 on
      // 2026-04-29 (factory deploy tx).
      start: "2026-04-29",
      meta: {
        methodology: {
          Volume:
            "Sum of gross KUB notional from every TokensBought / TokensSold " +
            "event emitted by BondingCurveMarket contracts spawned by the " +
            "V4.5 factory (0xdf4f…C005) and V4.6.6 factory (0x89b6…3c87). " +
            "Buy volume = kubIn (gross, fee inclusive); sell volume = " +
            "kubOut + fee (gross, fee re-added because kubOut is post-fee). " +
            "Amounts are credited to KKUB and priced via DefiLlama's Bitkub " +
            "Chain oracle. Both factory generations share byte-identical " +
            "trade event ABIs and are summed into a single series.",
          Fees:
            "Sum of the on-chain `fee` field of every TokensBought / " +
            "TokensSold event. Equal to 0.9 % treasury + 0.1 % creator = " +
            "1.0 % of gross KUB notional under V4.5; V4.6.6 keeps the same " +
            "1.0 % aggregate split. Field denominated in native KUB.",
          Revenue:
            "Equal to Fees. 100 % of trading fees accrue to the protocol " +
            "treasury and token creator — there are no LPs to share with " +
            "during the bonding-curve phase and no governance-token " +
            "emissions diluting the take.",
        },
      },
    },
  },
};

export default adapter;
