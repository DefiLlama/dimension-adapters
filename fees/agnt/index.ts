// DefiLlama dimension-adapters fees/revenue adapter for AGNT (my.agnt.social)
// Fork path: dimension-adapters/fees/agnt/index.ts
//
// Method: Clanker-style claimed fees (fees/clanker.ts) — count WETH received by the
// AGNT platform fee wallet, which the Doppler launchpad releases on fee claims.
// The SAME wallet + 32/63/5 beneficiary split applies on every chain AGNT launches
// on; only the WETH address and the fee-releasing initializers differ per chain.
//
// Chains:
//   • Base (8453) — original launchpad. Platform wallet 0x5bF5805e… receives WETH
//     from the two Doppler initializers on fee claims. Trading: 0.40% in-app swap
//     fee withdrawn from Relay's claim contract as USDC (Base only).
//   • Robinhood Chain (4663) — AGNT's newer launchpad. Same 32% platform WETH share,
//     released by the RH Doppler initializers to the same wallet. Added 2026-07-29
//     after automated fee collection began landing RH fees on-chain; without this the
//     adapter reported ~$0 because AGNT's launch volume moved to RH + Solana.
//
// Not yet covered: Solana launch fees (agent LP-fee cut to the AGNT treasury — a
// different, non-EVM mechanism; add in a follow-up). The launched-token fee leg is
// still excluded on both EVM chains (unpriced/illiquid) — figures are a WETH-side
// lower bound, consistent with the original Base-only version.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";

// AGNT launch-fee platform beneficiary (32% of the 1.095% Doppler terminal pool fee).
const PLATFORM_FEE_WALLET = "0x5bF5805e4809A447a61621f8698CEdeA2D1fC5f0"; // CLAW_FEE_ADDRESS
// Platform keeps 32% of the pool fee → total user-paid fee = platform revenue / 0.32.
const PLATFORM_SHARE = 0.32;
const CREATOR_SHARE = 0.63;
const DOPPLER_SHARE = 0.05;
// Trading: 0.40% in-app swap fee, paid by Relay to the app-fee recipient
// (RELAY_APP_FEE_RECIPIENT). Paid mostly as WETH straight from Relay's Base
// settlement contract, plus occasional USDC from Relay's claim contract. Filtered
// to those two senders so only fee inflows count (the wallets also see stray
// unrelated tokens). AGNT keeps 100%. Base only.
//
// The app-fee recipient was REPOINTED mid-2026 from the original wallet to the
// launch-fee treasury wallet, so trading fees have landed at BOTH over time. Count
// both to capture the full history + all ongoing fees. Filtering by the Relay
// senders means the launch-fee wallet's Relay inflows are still counted here as
// trading fees while its Doppler-initializer inflows remain the launchpad leg — no
// double counting, since the two use disjoint fromAdddesses sets.
const TRADING_FEE_WALLETS = [
  "0x585b685414D6ff141Ed1A4A0dD0837423e440598", // original RELAY_APP_FEE_RECIPIENT (pre-repoint)
  "0x5bF5805e4809A447a61621f8698CEdeA2D1fC5f0", // current RELAY_APP_FEE_RECIPIENT (post-repoint; == launch-fee wallet)
];
const RELAY_SETTLEMENT = "0xc7F712b7e7A561eFEe674955125BD2f0243200C4"; // Relay Base settlement (pays WETH app fee)
const RELAY_CLAIM_CONTRACT = "0xf70da97812cb96acdf810712aa562db8dfa3dbef"; // Relay claim (occasional USDC)

// Per-chain config. Same platform wallet + beneficiary split everywhere; only the WETH
// deployment and the fee-releasing Doppler initializers differ. The wrong initializer
// simply never sent WETH to the wallet, so the fromAdddesses filter is exact per chain.
const CHAIN_CONFIG: Record<string, { weth: string; initializers: string[] }> = {
  [CHAIN.BASE]: {
    weth: ADDRESSES.base.WETH,
    initializers: [
      "0xd59ce43e53d69f190e15d9822fb4540dccc91178", // DecayMulticurveInitializer (current)
      "0xbdf938149ac6a781f94faa0ed45e6a0e984c6544", // DopplerHookInitializer (legacy)
    ],
  },
  [CHAIN.ROBINHOOD]: {
    // Robinhood Chain WETH is RH's own deployment, NOT the OP-stack 0x42..0006.
    weth: ADDRESSES.robinhood.WETH,
    initializers: [
      "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544", // dopplerHookInitializer (4663)
      "0x6f02324d20cc679d0e585290caa6b16bacbc0f77", // rehypeDopplerHookInitializer (4663)
    ],
  },
};

// ── Pons launches (Robinhood) ───────────────────────────────────────────────
// AGNT's newer Robinhood launches use PonsV2, not Doppler. Their fees do NOT
// arrive as WETH from a Doppler initializer — they accrue on the pons curve/escrow
// and are released by a per-token AgntFeeWedge, which splits each fee as NATIVE ETH:
// `toAgnt` (AGNT's 2/7 protocol cut) + `forwarded` (5/7 to the token's own engine),
// with `total` the gross fee. The WETH-from-initializer path above is blind to
// these, so Robinhood read ~$0 despite live pons volume. We read the wedges' Split
// events directly: enumerate every wedge from the factory, then sum this day's
// native legs. Only the native (ETH) leg is counted — the launched-token fee leg is
// illiquid/unpriced, matching the WETH-side lower-bound convention of the Doppler leg.
const WEDGE_FACTORY = "0xE3b4d1c71283012D7392d358dA2feEE2a6D22d3d"; // AgntFeeWedgeFactory (4663)
const WEDGE_FACTORY_START_BLOCK = 47600000; // just below the first wedge deploy (2026-08-27)
const WEDGE_DEPLOYED_ABI = "event WedgeDeployed(bytes32 indexed launchId, address indexed wedge, address forwardTarget)";
const WEDGE_SPLIT_ABI = "event Split(address indexed currency, uint256 total, uint256 toAgnt, uint256 forwarded)";
const NATIVE = ADDRESSES.null;

// ── AGNTS NFT mint (Robinhood) ──────────────────────────────────────────────
// AGNT's own PFP collection (AGNTS, 0x57efd86c…f2d5) mints through a controller
// that escrows each buyer's payment and credits it to `proceeds` once the request
// settles. Buyers pay native ETH; AGNT keeps 100% — there is no creator or
// protocol split on a first-party mint, so mint fees == mint revenue and nothing
// is supply-side.
//
// Indexed from ProceedsWithdrawn rather than per-mint events: payment and delivery
// are separate steps here (pay/settle, then a vault transfer delivers the NFT), so
// no single per-buyer event carries the amount for every path. The withdrawal is
// exact, is the money that actually reaches the treasury, and cannot double-count.
// It is lumpy — revenue lands on the day the proceeds are swept, not the day of
// the mint — which matches how the Pons leg above already behaves (fees realize
// when the keeper pokes).
const NFT_MINT_CONTROLLER = "0xfAD3335ba59c8e4438C2be47147080EF5809bF7e"; // AGNTMintController (4663)
const PROCEEDS_WITHDRAWN_ABI = "event ProceedsWithdrawn(address indexed to, uint256 amount)";

// AGNTS activation — Robinhood only. Holders "activate" an AGNTS NFT (give it an agent soul
// and an ERC-6551 wallet) by paying an ETH fee (100% to the protocol treasury) plus a fixed
// $AGNTS cost, of which burnBps (50% today) is burned and the rest goes to the treasury.
// The Activated event carries both amounts exactly.
const ACTIVATION_ENGINE = "0x6F2d62C31F85941537F1EF6F1d68dDc28d1EDfCB"; // AGNTSActivation (4663)
const AGNTS_TOKEN = "0x2c7A596448F329e3Ad35181BE4Be19D941a682B9"; // $AGNTS (4663)
const ACTIVATED_ABI = "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 share, uint256 agntsPaid, uint256 ethPaid, address account)";

// AGNTS NFT swaps — Robinhood only. Trade an AGNTS NFT for one of the same tier from the
// protocol vault: a random pack (commit/reveal) or an exact pick ("snipe"). The ETH fee goes
// 100% to the protocol (holder-fee and treasury recipients are both the treasury). The swap
// events do not carry the fee, so it is read from the engine at the swap's own block:
// the tiered engine charges randomFee(tier)/exactFee(tier); the original flat engine (retired
// 2026-09-25) charged randomFeeWei()/exactFeeWei() for every tier.
const SWAP_ENGINE_TIERED = "0x35Ac0862c4D95AD8303eEFcd81021c718AF11F42";
const SWAP_ENGINE_FLAT = "0xa2adb76fbcfbea79f2d1228fdcc2e4c8e9817767";
const SWAP_COMMITTED_ABI = "event SwapCommitted(uint256 indexed id, address indexed owner, uint8 tier, uint64 revealBlock, uint256 tokenIdIn)";
const SNIPED_ABI = "event Sniped(address indexed owner, uint256 tokenIdIn, uint256 tokenIdOut, uint8 tier)";

const fetch = async (options: FetchOptions) => {
  const cfg = CHAIN_CONFIG[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Platform's 32% launch-fee share, released by the Doppler initializers.
  // On Robinhood a launch can pair against an RWA numeraire (a tokenized stock like
  // AAPL — e.g. $BEER) INSTEAD of WETH, so the platform share arrives in whichever
  // asset the pool used. Counting WETH only missed every RWA-paired launch, so on RH
  // we count ALL assets released by the initializers: DefiLlama prices the numeraires
  // (AAPL etc.), and the launched-token leg stays a no-op because it is unpriced —
  // preserving the same priced-lower-bound convention. Base pools are all WETH-paired,
  // so it stays WETH-only there. (fromAdddesses = fee releases only, so nothing else counts.)
  const launchFeeTokens = options.chain === CHAIN.ROBINHOOD ? undefined : [cfg.weth];
  const revenue = await addTokensReceived({
    options,
    targets: [PLATFORM_FEE_WALLET],
    tokens: launchFeeTokens,
    fromAdddesses: cfg.initializers, // count only fee releases (helper param spelled fromAdddesses)
  });

  dailyRevenue.addBalances(revenue, "Launchpad Fees to Protocol");
  dailyFees.addBalances(revenue.clone(1 / PLATFORM_SHARE), "Launchpad Fees");
  dailySupplySideRevenue.addBalances(revenue.clone(CREATOR_SHARE / PLATFORM_SHARE), "Launchpad Fees to Creators");
  dailySupplySideRevenue.addBalances(revenue.clone(DOPPLER_SHARE / PLATFORM_SHARE), "Launchpad Fees to Doppler");

  // Trading fees — Base only. Relay pays the 0.40% app fee to the app-fee recipient
  // wallet(s): WETH from its settlement contract, occasional USDC from its claim
  // contract. Both senders whitelisted so unrelated inflows don't count. Counts both
  // the pre- and post-repoint recipient wallets. AGNT keeps 100%, so trading fees ==
  // trading revenue.
  if (options.chain === CHAIN.BASE) {
    const tradingFees = await addTokensReceived({
      options,
      targets: TRADING_FEE_WALLETS,
      tokens: [ADDRESSES.base.WETH, ADDRESSES.base.USDC],
      fromAdddesses: [RELAY_SETTLEMENT, RELAY_CLAIM_CONTRACT],
    });
    dailyFees.addBalances(tradingFees, "Trading Fees");
    dailyRevenue.addBalances(tradingFees, "Trading Fees to Protocol");
  }

  // Pons launch fees — Robinhood only. Fees flow through per-token AgntFeeWedge
  // contracts (curve → escrow → wedge → Split), not a Doppler pool, so the WETH
  // leg above misses them. Enumerate every wedge from the factory (all-time up to
  // the day's end), then sum this day's NATIVE (ETH) Split legs: `total` = gross
  // fee, `toAgnt` = AGNT's protocol cut, `forwarded` = the token's own engine.
  if (options.chain === CHAIN.ROBINHOOD) {
    const deployed = await options.getLogs({
      target: WEDGE_FACTORY,
      eventAbi: WEDGE_DEPLOYED_ABI,
      fromBlock: WEDGE_FACTORY_START_BLOCK,
      toBlock: await options.getToBlock(),
    });
    const wedges = [...new Set(deployed.map((l: any) => String(l.wedge)))];
    if (wedges.length) {
      const splits = await options.getLogs({ targets: wedges, eventAbi: WEDGE_SPLIT_ABI });
      for (const s of splits) {
        if (String(s.currency).toLowerCase() !== NATIVE) continue; // native leg only (WETH-side lower bound)
        dailyFees.add(cfg.weth, s.total, "Pons Launchpad Fees");
        dailyRevenue.add(cfg.weth, s.toAgnt, "Pons Fees to Protocol");
        dailySupplySideRevenue.add(cfg.weth, s.forwarded, "Pons Fees to Engine");
      }
    }
  }

  // AGNTS NFT mint — Robinhood only. 100% to the protocol, so the same amount
  // lands in both fees and revenue and none in supply-side.
  if (options.chain === CHAIN.ROBINHOOD) {
    // No fromBlock: this must be the DAY's window, like the Pons splits above.
    // Passing the deploy block would re-count every withdrawal ever made, on
    // every single day the adapter runs.
    const withdrawals = await options.getLogs({
      target: NFT_MINT_CONTROLLER,
      eventAbi: PROCEEDS_WITHDRAWN_ABI,
    });
    for (const w of withdrawals) {
      dailyFees.add(cfg.weth, w.amount, "NFT Mint Fees");
      dailyRevenue.add(cfg.weth, w.amount, "NFT Mint Fees to Protocol");
    }
  }

  const dailyHoldersRevenue = options.createBalances();
  if (options.chain === CHAIN.ROBINHOOD) {
    // Activation: ETH fee (all protocol) + $AGNTS cost (burnBps burned, rest to the treasury).
    const activations = await options.getLogs({ target: ACTIVATION_ENGINE, eventAbi: ACTIVATED_ABI });
    if (activations.length) {
      const burnBps = BigInt(await options.api.call({ target: ACTIVATION_ENGINE, abi: "uint16:burnBps" }));
      for (const a of activations) {
        const agnts = BigInt(a.agntsPaid);
        const burned = (agnts * burnBps) / 10000n;
        dailyFees.add(cfg.weth, a.ethPaid, "Activation Fees");
        dailyRevenue.add(cfg.weth, a.ethPaid, "Activation Fees to Protocol");
        dailyFees.add(AGNTS_TOKEN, agnts, "Activation $AGNTS");
        dailyRevenue.add(AGNTS_TOKEN, agnts - burned, "Activation $AGNTS to Protocol");
        dailyHoldersRevenue.add(AGNTS_TOKEN, burned, "Activation $AGNTS Burned");
      }
    }

    // Swaps: fee read at each swap's block (fees move with the NFT floor).
    const swapLogs = (await Promise.all([
      options.getLogs({ targets: [SWAP_ENGINE_TIERED, SWAP_ENGINE_FLAT], eventAbi: SWAP_COMMITTED_ABI, onlyArgs: false }).then((l: any[]) => l.map((x) => ({ x, exact: false }))),
      options.getLogs({ targets: [SWAP_ENGINE_TIERED, SWAP_ENGINE_FLAT], eventAbi: SNIPED_ABI, onlyArgs: false }).then((l: any[]) => l.map((x) => ({ x, exact: true }))),
    ])).flat();
    for (const { x, exact } of swapLogs) {
      const engine = String(x.address ?? x.target ?? "").toLowerCase();
      const tier = Number(x.args?.tier ?? x.tier);
      const block = Number(x.blockNumber);
      const fee = engine === SWAP_ENGINE_TIERED.toLowerCase()
        ? await options.api.call({ target: SWAP_ENGINE_TIERED, abi: exact ? "function exactFee(uint8) view returns (uint256)" : "function randomFee(uint8) view returns (uint256)", params: [tier], block })
        : await options.api.call({ target: SWAP_ENGINE_FLAT, abi: exact ? "uint256:exactFeeWei" : "uint256:randomFeeWei", block });
      dailyFees.add(cfg.weth, fee, "NFT Swap Fees");
      dailyRevenue.add(cfg.weth, fee, "NFT Swap Fees to Protocol");
    }
  }

  // Revenue = protocol revenue + the burned $AGNTS (holders revenue); protocol revenue excludes the burn.
  const dailyProtocolRevenue = dailyRevenue.clone();
  dailyRevenue.addBalances(dailyHoldersRevenue);
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE, CHAIN.ROBINHOOD],
  start: "2026-07-15",
  methodology: {
    Fees: "Total fees paid by users on AGNT: (1) the 1.095% Doppler V4 terminal pool fee on tokens launched via the launchpad on Base + Robinhood Chain, derived from the observed on-chain platform fee share (WETH on Base; WETH plus RWA numeraires — tokenized stocks like AAPL that a Robinhood launch pairs against, e.g. $BEER — on Robinhood, priced by DefiLlama; the unpriced launched-token leg is excluded, a conservative lower bound); plus (2) the 0.40% platform fee on in-app swaps (Base), measured as WETH + USDC paid by Relay to AGNT's app-fee recipient wallet; plus (3) fees from PonsV2 launches on Robinhood Chain, read from each token's AgntFeeWedge Split events (native-ETH leg = total user-paid fee); plus (4) native-ETH paid by buyers to mint AGNT's own AGNTS PFP collection on Robinhood Chain; plus (5) AGNTS activation fees on Robinhood Chain (ETH fee + $AGNTS cost, from the Activated event); plus (6) AGNTS NFT swap fees on Robinhood Chain (random packs and exact picks; the fee is read from the swap engine at each swap's block).",
    Revenue: "Fees kept by AGNT: the 32% platform share of launchpad pool fees (WETH released by the Doppler initializers on Base + Robinhood, to 0x5bF5805e…C5f0) plus 100% of the 0.40% swap fee (WETH + USDC paid by Relay on Base to the app-fee recipient wallets — 0x585b6854…0598 pre-repoint and 0x5bF5805e…C5f0 post-repoint) plus AGNT's ~2/7 (28.57%) protocol cut of PonsV2 launch fees on Robinhood (the `toAgnt` leg of each AgntFeeWedge Split; the remaining 5/7 is forwarded to each token's own engine) plus 100% of AGNTS NFT mint proceeds on Robinhood (a first-party collection, so there is no creator split) plus 100% of AGNTS activation ETH fees and swap fees, and the full $AGNTS activation cost (the treasury share plus the burned share).",
    ProtocolRevenue: "Revenue kept by the AGNT treasury: everything in Revenue except the burned share of the $AGNTS activation cost.",
    HoldersRevenue: "The share of each AGNTS activation's $AGNTS cost that is burned (burnBps, 50% today).",
    SupplySideRevenue: "The 68% of launchpad pool fees paid to third-party token creators (63%) and the Doppler protocol (~5%), estimated from the observed platform WETH share.",
  },
  breakdownMethodology: {
    Fees: {
      "Launchpad Fees": "1.095% Doppler terminal fee (WETH leg), estimated as platform WETH share / 0.32, on Base + Robinhood Chain.",
      "Trading Fees": "0.40% swap fee (Base), WETH + USDC paid by Relay to the app-fee recipient wallet.",
      "Pons Launchpad Fees": "PonsV2 launch fees on Robinhood Chain (native-ETH leg), the `total` of each token's AgntFeeWedge Split event.",
      "NFT Mint Fees": "Native ETH paid by buyers minting AGNT's own AGNTS PFP collection on Robinhood Chain, measured as proceeds withdrawn from the mint controller.",
      "Activation Fees": "ETH fee paid to activate an AGNTS NFT (Robinhood), from the Activated event.",
      "Activation $AGNTS": "$AGNTS paid to activate an AGNTS NFT (Robinhood), from the Activated event.",
      "NFT Swap Fees": "ETH fee for AGNTS NFT swaps (random packs and exact picks) on Robinhood, read from the swap engine at each swap's block.",
    },
    Revenue: {
      "Launchpad Fees to Protocol": "32% platform share, WETH released to the fee wallet on Base + Robinhood",
      "Trading Fees to Protocol": "100% of the 0.40% swap fee, WETH + USDC paid by Relay to the app-fee recipient (Base)",
      "Pons Fees to Protocol": "AGNT's ~2/7 (28.57%) cut of PonsV2 launch fees, the `toAgnt` leg of each AgntFeeWedge Split (Robinhood).",
      "NFT Mint Fees to Protocol": "100% of AGNTS NFT mint proceeds (Robinhood) — a first-party collection, so AGNT keeps all of it.",
      "Activation Fees to Protocol": "100% of the AGNTS activation ETH fee (Robinhood).",
      "Activation $AGNTS to Protocol": "The non-burned share of the $AGNTS activation cost, sent to the treasury (Robinhood).",
      "Activation $AGNTS Burned": "The burned share of the $AGNTS activation cost (Robinhood).",
      "NFT Swap Fees to Protocol": "100% of AGNTS NFT swap fees (Robinhood).",
    },
    ProtocolRevenue: {
      "Launchpad Fees to Protocol": "32% platform share, WETH released to the fee wallet on Base + Robinhood",
      "Trading Fees to Protocol": "100% of the 0.40% swap fee, WETH + USDC paid by Relay to the app-fee recipient (Base)",
      "Pons Fees to Protocol": "AGNT's ~2/7 (28.57%) cut of PonsV2 launch fees, the `toAgnt` leg of each AgntFeeWedge Split (Robinhood).",
      "NFT Mint Fees to Protocol": "100% of AGNTS NFT mint proceeds (Robinhood) — a first-party collection, so AGNT keeps all of it.",
      "Activation Fees to Protocol": "100% of the AGNTS activation ETH fee (Robinhood).",
      "Activation $AGNTS to Protocol": "The non-burned share of the $AGNTS activation cost, sent to the treasury (Robinhood).",
      "NFT Swap Fees to Protocol": "100% of AGNTS NFT swap fees (Robinhood).",
    },
    HoldersRevenue: {
      "Activation $AGNTS Burned": "The burned share of the $AGNTS activation cost (Robinhood).",
    },
    SupplySideRevenue: {
      "Launchpad Fees to Creators": "63% of launchpad pool fees paid to third-party token creators",
      "Launchpad Fees to Doppler": "5% of launchpad pool fees paid to the Doppler protocol",
      "Pons Fees to Engine": "The ~5/7 (71.43%) of each PonsV2 launch fee forwarded from the AgntFeeWedge to the token's own engine (Robinhood).",
    },
  },
  // Launchpad fees are Uniswap V4 pool fees (double-counted under Uniswap). The trading
  // fee is a separate app surcharge (not double-counted), but it's negligible vs launchpad
  // at current scale — revisit splitting if trading volume grows materially.
  doublecounted: true, // uniswap (launchpad leg)
};

export default adapter;
