import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getCheckpointBeforeWindow, graphqlCall, queryEventNodesInWindow } from "../../helpers/sui";

// POPULAR, a memecoin launchpad and launchpad aggregator on Sui: https://popularsui.xyz
// Contracts, events and fees: https://popularsui.xyz/data/integrators
// TVL adapter: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/popular/index.js

// Type origins: events keep the id of the package version that first defined them.
const POPULAR = "0x918d32f8a0b349584e96113ec425708374161d4798f8c28d63362602831b33ef"; // SUI bonding curves (v1)
const LAUNCH_OPTIONS = "0x1db1337c289900d612897510ea47baddcb631530463fe1ee381480aefa167ad5"; // launch options (v3)
const QUOTE = "0xfe9f27187eff1c0d1bb236166df360d0c12be4c0bd99d40ce1d3a51771cbe428"; // curves priced in USDC, wBTC, ETH, XAUM (v5)

// POPULAR's fee wallet, and the project's own wallets whose transfers to it are internal moves, not fees.
const FEE_WALLET = "0x81a73ddedd642dad2dc375110e7cddefc4a52cb872c2f5c2c1e54ebcf798324a";
const KEEPER = "0x39b92261afb72aecca4b5d84443e95c2cfb21d7910b78801d8dfb7daf902b8a1";
const OWN_WALLETS = new Set([
  FEE_WALLET,
  "0x9106a25c0e0093c30a143cbe7ef8ae1f9936720d585d16355d4c39b3834caad6", // deployer
  "0x528b697707a6c9037f98b64c9cf2e76e550b00041dcbf743429b521cf9d164d8", // 2-of-3 multisig (admin, treasury withdrawals)
  "0x2258eb58ce26517325f86993635ba15dbde17ffeb179b7066f70d7c0665145ba", // Walrus site publisher
]);
// Keeper transactions that pay fees to the fee wallet: they call POPULAR's open-vault modules (its share of the vaults'
// pool fees), lending modules (interest share and default fees) or order modules (limit, stop and DCA fills). Every
// other keeper transaction (balance sweeps to the fee wallet, arbitrage) is skipped.
const KEEPER_FEE_MODULES = new Set([
  "open_vault", "open_vault_cetus", "vault", "vault_cetus", "dlmm_vault", // popular_bundles, popular_bundles_dlmm
  "loan", "safe", "market", // popular_p2p (its `vault` module shares the name above)
  "order", "auto", // popular_orders
]);

// Curve fee split, in bps of the trade (config::Params, unchanged since launch: trade_fee 100 = creator 50 + platform 30
// + season 10 + liquidity 10). A referrer earns 10, taken half from platform and half from season. A creator tax
// (0-10%, can only be lowered) goes to the creator side. Anything above base fee and tax is the anti-snipe penalty
// of the first 15-60 s, split half season, half platform. Mirrors `curve::fee_shares`.
const BPS = 10_000n;
const TRADE_FEE = 100n, CREATOR = 50n, LIQUIDITY = 10n, SEASON = 10n, REFERRAL = 10n;
const min = (a: bigint, b: bigint) => (a < b ? a : b);

function feeShares(total: bigint, tradeSize: bigint, taxBps: bigint, withReferrer: boolean) {
  const base = min((tradeSize * TRADE_FEE) / BPS, total);
  let penalty = total - base;
  const tax = min((tradeSize * taxBps) / BPS, penalty);
  penalty -= tax;
  let left = base;
  const creator = min((tradeSize * CREATOR) / BPS, left);
  left -= creator;
  const liquidity = min((tradeSize * LIQUIDITY) / BPS, left);
  left -= liquidity;
  let season = (tradeSize * SEASON) / BPS;
  let referral = 0n;
  if (withReferrer) {
    referral = min((tradeSize * REFERRAL) / BPS, left);
    season -= (tradeSize * (REFERRAL / 2n)) / BPS;
    left -= referral;
  }
  season = min(season, left);
  const platform = left - season;
  const penaltySeason = penalty / 2n;
  return { creator: creator + tax, liquidity, referral, season: season + penaltySeason, platform: platform + penalty - penaltySeason };
}

// Every event of a type since the package was published, with its time. Used for the few launch-option events.
async function allEvents(type: string): Promise<{ ts: number; json: any }[]> {
  const out: { ts: number; json: any }[] = [];
  let after: string | null = null;
  while (true) {
    const { events }: any = await graphqlCall(`query ($after: String) {
      events(first: 50, after: $after, filter: { type: "${type}" }) {
        pageInfo { hasNextPage endCursor }
        nodes { timestamp contents { json } }
      }
    }`, { after });
    for (const node of events.nodes) out.push({ ts: Date.parse(node.timestamp), json: node.contents.json });
    if (!events.pageInfo.hasNextPage) return out;
    after = events.pageInfo.endCursor;
  }
}

// Creator tax of each curve over time: set at launch (`LaunchConfigured`), only ever lowered (`CreatorTaxLowered`).
async function taxTimeline() {
  const [configured, lowered] = await Promise.all([
    allEvents(`${LAUNCH_OPTIONS}::curve::LaunchConfigured`),
    allEvents(`${LAUNCH_OPTIONS}::curve::CreatorTaxLowered`),
  ]);
  const steps: Record<string, { ts: number; bps: bigint }[]> = {};
  for (const e of configured) if (BigInt(e.json.creator_tax_bps) > 0n) (steps[e.json.curve_id] ??= []).push({ ts: e.ts, bps: BigInt(e.json.creator_tax_bps) });
  for (const e of lowered) (steps[e.json.curve_id] ??= []).push({ ts: e.ts, bps: BigInt(e.json.to_bps) });
  Object.values(steps).forEach((s) => s.sort((a, b) => a.ts - b.ts));
  return (curveId: string, ts: number) => {
    let bps = 0n;
    for (const s of steps[curveId] ?? []) if (s.ts <= ts) bps = s.bps;
    return bps;
  };
}

// The quote coin of a quote curve, from its object type `qcurve::QCurve<T, Q>`.
const quoteCoins: Record<string, Promise<string>> = {};
function quoteCoinOf(curveId: string): Promise<string> {
  return quoteCoins[curveId] ??= graphqlCall(`{ object(address: "${curveId}") { asMoveObject { contents { type { repr } } } } }`).then(({ object }: any) => {
    const repr: string = object?.asMoveObject?.contents?.type?.repr ?? "";
    const args = repr.slice(repr.indexOf("<") + 1, repr.lastIndexOf(">"));
    const quote = args.slice(args.lastIndexOf(",") + 1).trim();
    if (!repr.includes("::qcurve::QCurve<") || !quote) throw new Error(`popular: no quote coin for curve ${curveId}`);
    return quote;
  });
}

const LABELS = {
  curve: "Bonding curve trading fees",
  graduation: "Graduation fees",
  site: "Site trading and service fees",
  keeper: "Open vault, lending and order fees collected by the keeper",
};
const SUPPLY = {
  creator: "Curve fees to creators (creator, buyback and burn or holders, by the token's fee mode)",
  liquidity: "Curve fees added to the graduated pool's liquidity",
  referral: "Curve fees to referrers",
  season: "Curve fees to the trading season rewards pool",
  graduation: "Graduation fees to creators",
};
const REVENUE = {
  curve: "Bonding curve trading fees to POPULAR",
  graduation: "Graduation fees to POPULAR",
  site: "Site trading and service fees to POPULAR",
  keeper: "Open vault, lending and order fees to POPULAR",
};

const shortType = (repr: string) => repr.replace(/^0x0+(?=[0-9a-f])/i, "0x");

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1. Bonding curves. `sui_amount` / `quote_amount` is the trade size the fee shares apply to (a buy's payment
  //    including the fee, a sell's proceeds before it); `fee` is what was charged.
  const taxAt = await taxTimeline();
  const curveTrades = async (type: string, amountField: string, coinOf: (curveId: string) => Promise<string>) => {
    const events = await queryEventNodesInWindow(type, options);
    for (const { json } of events) {
      const coin = await coinOf(json.curve_id);
      const fee = BigInt(json.fee);
      const s = feeShares(fee, BigInt(json[amountField]), taxAt(json.curve_id, Number(json.timestamp_ms)), json.referrer != null);
      dailyFees.add(coin, fee, LABELS.curve);
      dailyRevenue.add(coin, s.platform, REVENUE.curve);
      dailySupplySideRevenue.add(coin, s.creator, SUPPLY.creator);
      dailySupplySideRevenue.add(coin, s.liquidity, SUPPLY.liquidity);
      dailySupplySideRevenue.add(coin, s.referral, SUPPLY.referral);
      dailySupplySideRevenue.add(coin, s.season, SUPPLY.season);
    }
  };
  await curveTrades(`${POPULAR}::curve::Traded`, "sui_amount", async () => ADDRESSES.sui.SUI);
  await curveTrades(`${QUOTE}::qcurve::QuoteTraded`, "quote_amount", quoteCoinOf);

  // 2. Graduation: 1% of the raise (0.6% creator, 0.4% POPULAR) when a curve moves to its Cetus pool.
  const graduations = async (type: string, coinOf: (json: any) => Promise<string>) => {
    for (const { json } of await queryEventNodesInWindow(type, options)) {
      const coin = await coinOf(json);
      dailyFees.add(coin, BigInt(json.creator_fee) + BigInt(json.platform_fee), LABELS.graduation);
      dailyRevenue.add(coin, json.platform_fee, REVENUE.graduation);
      dailySupplySideRevenue.add(coin, json.creator_fee, SUPPLY.graduation);
    }
  };
  await graduations(`${POPULAR}::graduation::Graduated`, async () => ADDRESSES.sui.SUI);
  await graduations(`${QUOTE}::qgraduation::QuoteGraduated`, (json) => quoteCoinOf(json.curve_id));

  // 3. Fees paid straight to POPULAR's fee wallet inside users' transactions: the 0.3% fee on trades routed through the
  //    site (DEX aggregator routes, other launchpads' curves, index tokens), OTC, lending and launch fees, and
  //    gas-sponsorship fees. Plus, in the keeper's transactions, POPULAR's share of open-vault pool fees, lending fees
  //    it collects and the fee of the orders it fills.
  const [{ sequenceNumber: fromCp }, { sequenceNumber: toCp }] = await Promise.all([
    getCheckpointBeforeWindow(options.startTimestamp),
    getCheckpointBeforeWindow(options.endTimestamp),
  ]);
  let after: string | null = null;
  while (true) {
    const { transactions }: any = await graphqlCall(`query ($after: String) {
      transactions(first: 50, after: $after, filter: { affectedAddress: "${FEE_WALLET}", afterCheckpoint: ${fromCp}, beforeCheckpoint: ${toCp + 1} }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          sender { address }
          effects { status balanceChanges(first: 50) { nodes { owner { address } amount coinType { repr } } } }
          kind { ... on ProgrammableTransaction { commands(first: 50) { nodes { ... on MoveCallCommand { function { name module { name } } } } } } }
        }
      }
    }`, { after });
    for (const tx of transactions.nodes) {
      if (tx.effects?.status !== "SUCCESS") continue;
      const sender = tx.sender?.address;
      if (!sender || OWN_WALLETS.has(sender)) continue;
      let label = LABELS.site, revenueLabel = REVENUE.site;
      if (sender === KEEPER) {
        const modules: string[] = (tx.kind?.commands?.nodes ?? []).filter((c: any) => c.function).map((c: any) => c.function.module.name);
        if (!modules.some((m) => KEEPER_FEE_MODULES.has(m))) continue;
        [label, revenueLabel] = [LABELS.keeper, REVENUE.keeper];
      }
      for (const change of tx.effects.balanceChanges.nodes) {
        if (change.owner?.address !== FEE_WALLET || BigInt(change.amount) <= 0n) continue;
        const coin = shortType(change.coinType.repr);
        dailyFees.add(coin, change.amount, label);
        dailyRevenue.add(coin, change.amount, revenueLabel);
      }
    }
    if (!transactions.pageInfo.hasNextPage) break;
    after = transactions.pageInfo.endCursor;
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
  Fees: "Trading fees on POPULAR's bonding curves (1% plus any creator tax and the anti-snipe fee of a launch's first seconds), the 1% graduation fee when a curve moves to its Cetus pool, and fees paid to POPULAR's fee wallet: the site's fee on trades it routes (DEX aggregator, other launchpads' curves, index tokens), limit-order, OTC, lending, launch and gas-sponsorship fees, and POPULAR's share of open-vault pool fees. Pool fees earned by liquidity providers on DEXes are not included.",
  UserFees: "All fees are paid by traders, launchers and borrowers.",
  Revenue: "POPULAR's share: 0.3% of curve trades (0.25% with a referrer) and half of the anti-snipe fee, 0.4% of a graduating raise, and everything paid to its fee wallet.",
  ProtocolRevenue: "All revenue goes to POPULAR's treasury and fee wallet.",
  SupplySideRevenue: "Curve fees to creators (0.5% plus the creator tax, routed by the token's fee mode to the creator, buyback and burn or holders), to the graduated pool's liquidity (0.1%), to referrers (0.1%) and to the trading season rewards pool (0.1% and half of the anti-snipe fee), plus 0.6% of a graduating raise to the creator.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SUI],
  start: "2026-09-15",
  fetch,
  methodology,
  breakdownMethodology: {
    Fees: {
      [LABELS.curve]: "Fees charged on buys and sells against POPULAR bonding curves (`curve::Traded`, `qcurve::QuoteTraded` events).",
      [LABELS.graduation]: "1% of the raise taken when a curve graduates to Cetus (`graduation::Graduated` events).",
      [LABELS.site]: "Coins received by POPULAR's fee wallet in users' transactions: site trading fees, OTC, lending, launch and gas-sponsorship fees.",
      [LABELS.keeper]: "POPULAR's share of open-vault pool fees, lending interest share and default fees, and the fee of limit, stop and DCA orders, received by the fee wallet in the keeper's transactions.",
    },
    Revenue: {
      [REVENUE.curve]: "Platform share of curve trading fees, kept in POPULAR's treasury.",
      [REVENUE.graduation]: "0.4% of a graduating raise.",
      [REVENUE.site]: "All site trading and service fees.",
      [REVENUE.keeper]: "All of these keeper-collected fees.",
    },
    SupplySideRevenue: {
      [SUPPLY.creator]: "Creator share of curve trading fees plus any creator tax.",
      [SUPPLY.liquidity]: "Liquidity bonus added to the token's pool when it graduates.",
      [SUPPLY.referral]: "Referral fees accrued to referrers.",
      [SUPPLY.season]: "Season pool paid out to traders as trading rewards.",
      [SUPPLY.graduation]: "0.6% of a graduating raise, paid to the creator.",
    },
  },
};

export default adapter;
