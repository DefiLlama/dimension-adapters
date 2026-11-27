import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getCheckpointBeforeWindow, graphqlCall } from "../../helpers/sui";

// POPULAR, a memecoin launchpad and launchpad aggregator on Sui: https://popularsui.xyz
// Contracts, events and fees: https://popularsui.xyz/data/integrators
// TVL adapter: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/popular/index.js

// Type origins: events keep the id of the package version that first defined them.
const POPULAR = "0x918d32f8a0b349584e96113ec425708374161d4798f8c28d63362602831b33ef"; // SUI bonding curves (v1)
const LAUNCH_OPTIONS = "0x1db1337c289900d612897510ea47baddcb631530463fe1ee381480aefa167ad5"; // launch options (v3)
const QUOTE = "0xfe9f27187eff1c0d1bb236166df360d0c12be4c0bd99d40ce1d3a51771cbe428"; // curves priced in USDC, wBTC, ETH, XAUM (v5)
const LEND = "0xed3220b79cb14da863fe5cb746a3a69a47c1be4080ddc60b63c1defdff98f8c3"; // popular_p2p lending

// POPULAR's fee wallet, and the project's own wallets whose transfers to it are internal moves, not fees.
const FEE_WALLET = "0x81a73ddedd642dad2dc375110e7cddefc4a52cb872c2f5c2c1e54ebcf798324a";
const KEEPER = "0x39b92261afb72aecca4b5d84443e95c2cfb21d7910b78801d8dfb7daf902b8a1";
// Pays the gas of trades from wallets without SUI; the trader pays POPULAR a gas fee in the same transaction.
const GAS_SPONSOR = "0x3a3b5fdc0fd212aa2dd61ab8d1c58bc3741705bc24e5099b2d75aee3263c207d";
const OWN_WALLETS = new Set([
  FEE_WALLET,
  "0x9106a25c0e0093c30a143cbe7ef8ae1f9936720d585d16355d4c39b3834caad6", // deployer
  "0x528b697707a6c9037f98b64c9cf2e76e550b00041dcbf743429b521cf9d164d8", // 2-of-3 multisig (admin, treasury withdrawals)
  "0x2258eb58ce26517325f86993635ba15dbde17ffeb179b7066f70d7c0665145ba", // Walrus site publisher
]);

// A fee-wallet receipt counts only when its transaction calls a package it can come from, checked by package family
// (the original package id, so later upgrades still match; a version is matched through its type origins):
// - a user's transaction that calls a venue the site trades through or one of POPULAR's own mainnet packages (the site
//   adds its fee to those transactions), or that POPULAR's gas sponsor paid for;
// - a keeper transaction that calls POPULAR's open-vault, lending or order packages (vault fee share, lending fees on
//   sold collateral, order fills).
// Plain transfers (donations, refunds, sweeps), POPULAR's staging copies on mainnet and every other keeper transaction
// (balance sweeps, arbitrage) are skipped.
const POPULAR_FAMILIES = {
  [POPULAR]: "curves (SUI and quote), graduation, vesting",
  "0xf332e48e1c3ca49e806ebd3cbca0fdb6de213f5906503cffdd7d74a9f28da3e1": "Amped",
  "0x5de2cf01feac4de63e94605f74830741d1a8d56efeccf7c9d795e18c4b95c183": "index tokens",
  "0x20ea839b3ddd963aef5bf7cb022b5dc5807a62c78230c59e12a921a01f2d251a": "POP pairs",
  "0xf7805603f871976fe85dd3ce5c9c60f7853805ed97f7813c32ea35b398134bf1": "OTC",
};
const KEEPER_FAMILIES = {
  "0x6917a02c3efd66fe57f813dc4c06bd030465b1ff6f01011bfa32ad94a2eee020": "bundles and open vaults",
  "0xb10e2b3a89243649f812d681331565ba6715042b935b6d68d3bbdfacd3060977": "DLMM open vaults",
  [LEND]: "lending",
  "0x5ca9b9dcbfef0dc82d04ebaace5c7917f407c208c879fcf2d175c9b59b4c9998": "limit, stop and DCA orders",
};
const VENUE_FAMILIES = {
  "0x33ec64e9bb369bf045ddc198c81adbf2acab424da37465d95296ee02045d2b17": "Cetus aggregator router",
  "0x9c2cef371c0e80648136f7ae65378ac9476e3fdb860538d00290e6e4f975b192": "Blast launchpad",
  "0x1f44a8e9fab4380228fe9c1bcc27d99b7f6ea76a8e18b5c178ca18cd46fb33c4": "Blast presale",
  "0xd70a8d11582fd1997380bc59bfd56a2f9028ebe11da74514ea3d386258d932fc": "Blast fee split",
  "0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0": "SuiPump",
  "0x7b4163d17ce18b386ee50929ba48fa0a2ecb60304df4b07e26835aa18617cda2": "SuiPump v2",
  "0x96a8523e464fdb6c1bb267404621cf47fcd3234d168b724b660995a420b439e3": "SuiPump v3",
  "0x97fea95545c04dc73f8174c6195013b100a26e3fa978e7cf8b100a51dfaf8354": "Perpsplexity line 1",
  "0x2649a5407e843c6fd35453e0bd49b364abd8e9fe89af899c6ab9371a4c26dcde": "Perpsplexity line 1 call package (defines no types)",
  "0xaedb8c9a905a778e831aeb4928f660210a7a645925348a7c4ec1cb4a6a3fd16e": "Perpsplexity line 2",
};
const SITE_FEE_FAMILIES = new Set([...Object.keys(VENUE_FAMILIES), ...Object.keys(POPULAR_FAMILIES), ...Object.keys(KEEPER_FAMILIES)]);
const KEEPER_FEE_FAMILIES = new Set(Object.keys(KEEPER_FAMILIES));

// Package families a called package belongs to: its own id plus the defining ids of its types (`package(address)`
// answers for the package's latest version, whose type origins include the original id).
const families: Record<string, Promise<Set<string>>> = {};
function familiesOf(pkg: string): Promise<Set<string>> {
  if (!families[pkg]) {
    families[pkg] = graphqlCall(`{ package(address: "${pkg}") { typeOrigins { definingId } } }`).then(({ package: p }: any) => {
      if (!p) throw new Error(`popular: no package ${pkg}`);
      return new Set<string>([pkg, ...(p.typeOrigins ?? []).map((t: any) => t.definingId)]);
    }).catch((e) => { delete families[pkg]; throw e; });
  }
  return families[pkg];
}
async function callsAny(packages: string[], allowed: Set<string>): Promise<boolean> {
  for (const pkg of packages) for (const f of await familiesOf(pkg)) if (allowed.has(f)) return true;
  return false;
}

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

// GraphQL pads system addresses (0x000…02::sui::SUI); balances key them in short form (0x2::sui::SUI).
const shortType = (repr: string) => repr.replace(/0x0{60,}([0-9a-f]{1,4})::/gi, "0x$1::");

// Type arguments of `Name<A, B>`, split at top-level commas only.
function typeArgs(repr: string): string[] {
  const inner = repr.slice(repr.indexOf("<") + 1, repr.lastIndexOf(">"));
  const args: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "<") depth++;
    else if (inner[i] === ">") depth--;
    else if (inner[i] === "," && depth === 0) { args.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  args.push(inner.slice(start).trim());
  return args.map(shortType);
}

// Where an event sits in the chain: its checkpoint, its transaction and its index in that transaction.
type ChainPos = { checkpoint: number; digest: string; seq: number };
type EventNode = { json: any; type: string; digest: string; pos: ChainPos };
const EVENT_FIELDS = `sequenceNumber timestamp contents { json type { repr } } transaction { digest effects { checkpoint { sequenceNumber } } }`;
const toNode = (node: any): EventNode => ({
  json: node.contents.json, type: node.contents.type.repr, digest: node.transaction.digest,
  pos: { checkpoint: Number(node.transaction.effects.checkpoint.sequenceNumber), digest: node.transaction.digest, seq: Number(node.sequenceNumber) },
});

// Events of a type (any type arguments) in the window `[startTimestamp, endTimestamp)`, in chain order.
async function eventsInWindow(type: string, options: FetchOptions): Promise<EventNode[]> {
  const { sequenceNumber } = await getCheckpointBeforeWindow(options.startTimestamp);
  const out: EventNode[] = [];
  let after: string | null = null;
  while (true) {
    const { events }: any = await graphqlCall(`query ($after: String) {
      events(first: 50, after: $after, filter: { type: "${type}", afterCheckpoint: ${sequenceNumber} }) {
        pageInfo { hasNextPage endCursor }
        nodes { ${EVENT_FIELDS} }
      }
    }`, { after });
    for (const node of events.nodes) {
      const ts = Date.parse(node.timestamp) / 1e3;
      if (ts >= options.endTimestamp) return out;
      if (ts >= options.startTimestamp) out.push(toNode(node));
    }
    if (!events.pageInfo.hasNextPage) return out;
    after = events.pageInfo.endCursor;
  }
}

// Every event of a type since the package was published. Used for the few launch-option events.
async function allEvents(type: string): Promise<EventNode[]> {
  const out: EventNode[] = [];
  let after: string | null = null;
  while (true) {
    const { events }: any = await graphqlCall(`query ($after: String) {
      events(first: 50, after: $after, filter: { type: "${type}" }) {
        pageInfo { hasNextPage endCursor }
        nodes { ${EVENT_FIELDS} }
      }
    }`, { after });
    for (const node of events.nodes) out.push(toNode(node));
    if (!events.pageInfo.hasNextPage) return out;
    after = events.pageInfo.endCursor;
  }
}

// Order of transactions inside a checkpoint, read only when two events to compare share one.
const checkpointTxs: Record<number, Promise<string[]>> = {};
function txOrder(checkpoint: number): Promise<string[]> {
  if (!checkpointTxs[checkpoint]) {
    checkpointTxs[checkpoint] = (async () => {
      const digests: string[] = [];
      let after: string | null = null;
      while (true) {
        const { checkpoint: cp }: any = await graphqlCall(`query ($after: String) {
          checkpoint(sequenceNumber: ${checkpoint}) { transactions(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { digest } } }
        }`, { after });
        if (!cp) throw new Error(`popular: no checkpoint ${checkpoint}`);
        digests.push(...cp.transactions.nodes.map((n: any) => n.digest));
        if (!cp.transactions.pageInfo.hasNextPage) return digests;
        after = cp.transactions.pageInfo.endCursor;
      }
    })().catch((e) => { delete checkpointTxs[checkpoint]; throw e; });
  }
  return checkpointTxs[checkpoint];
}

// Whether `a` happened before `b`: by checkpoint, then by the transaction's place in the checkpoint, then by the
// event's index in the transaction.
async function happenedBefore(a: ChainPos, b: ChainPos): Promise<boolean> {
  if (a.checkpoint !== b.checkpoint) return a.checkpoint < b.checkpoint;
  if (a.digest === b.digest) return a.seq < b.seq;
  const order = await txOrder(a.checkpoint);
  const ia = order.indexOf(a.digest), ib = order.indexOf(b.digest);
  if (ia < 0 || ib < 0) throw new Error(`popular: transactions ${a.digest} / ${b.digest} not in checkpoint ${a.checkpoint}`);
  return ia < ib;
}

// Creator tax of a curve at a trade: the last value set before the trade in chain order. It is set at launch
// (`LaunchConfigured`, zero when absent) and can only be lowered (`CreatorTaxLowered`), so the steps are already in
// chain order once sorted by checkpoint, and a step in the trade's own checkpoint is ordered against the trade itself.
async function taxResolver() {
  const [configured, lowered] = await Promise.all([
    allEvents(`${LAUNCH_OPTIONS}::curve::LaunchConfigured`),
    allEvents(`${LAUNCH_OPTIONS}::curve::CreatorTaxLowered`),
  ]);
  const steps: Record<string, { pos: ChainPos; bps: bigint }[]> = {};
  for (const e of configured) if (BigInt(e.json.creator_tax_bps) > 0n) (steps[e.json.curve_id] ??= []).push({ pos: e.pos, bps: BigInt(e.json.creator_tax_bps) });
  for (const e of lowered) (steps[e.json.curve_id] ??= []).push({ pos: e.pos, bps: BigInt(e.json.to_bps) });
  // Within one checkpoint the order is settled by happenedBefore below; across checkpoints the sort is exact.
  Object.values(steps).forEach((s) => s.sort((a, b) => a.pos.checkpoint - b.pos.checkpoint || (b.bps > a.bps ? 1 : b.bps < a.bps ? -1 : 0)));
  return async (curveId: string, trade: ChainPos) => {
    let bps = 0n;
    for (const s of steps[curveId] ?? []) if (await happenedBefore(s.pos, trade)) bps = s.bps;
    return bps;
  };
}

// The quote coin of a quote curve, from its object type `qcurve::QCurve<T, Q>`. A failed lookup is not cached.
const quoteCoins: Record<string, Promise<string>> = {};
function quoteCoinOf(curveId: string): Promise<string> {
  if (!quoteCoins[curveId]) {
    quoteCoins[curveId] = graphqlCall(`{ object(address: "${curveId}") { asMoveObject { contents { type { repr } } } } }`).then(({ object }: any) => {
      const repr: string = object?.asMoveObject?.contents?.type?.repr ?? "";
      if (!repr.includes("::qcurve::QCurve<")) throw new Error(`popular: no quote coin for curve ${curveId}`);
      return typeArgs(repr)[1];
    }).catch((e) => {
      delete quoteCoins[curveId];
      throw e;
    });
  }
  return quoteCoins[curveId];
}

const LABELS = {
  curve: "Bonding curve trading fees",
  graduation: "Graduation fees",
  interest: "Lending interest",
  defaults: "Lending default fees",
  site: "Site trading and service fees",
  keeper: "Open vault, lending and order fees collected by the keeper",
};
const SUPPLY = {
  creator: "Curve fees to creators (creator, buyback and burn or holders, by the token's fee mode)",
  liquidity: "Curve fees added to the graduated pool's liquidity",
  referral: "Curve fees to referrers",
  season: "Curve fees to the trading season rewards pool",
  graduation: "Graduation fees to creators",
  lenders: "Lending interest to lenders",
};
const REVENUE = {
  curve: "Bonding curve trading fees to POPULAR",
  graduation: "Graduation fees to POPULAR",
  interest: "Lending interest share to POPULAR",
  defaults: "Lending default fees to POPULAR",
  site: "Site trading and service fees to POPULAR",
  keeper: "Open vault, lending and order fees to POPULAR",
};

const nodesOf = (conn: any) => conn?.nodes ?? [];

// The rest of a transaction's balance changes or commands past the first page.
async function restOf(digest: string, field: "balanceChanges" | "commands", after: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | null = after;
  while (cursor) {
    const query = field === "balanceChanges"
      ? `query ($after: String) { transaction(digest: "${digest}") { effects { balanceChanges(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { owner { address } amount coinType { repr } } } } } }`
      : `query ($after: String) { transaction(digest: "${digest}") { kind { ... on ProgrammableTransaction { commands(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { ... on MoveCallCommand { function { module { package { address } } } } } } } } } }`;
    const { transaction }: any = await graphqlCall(query, { after: cursor });
    const conn = field === "balanceChanges" ? transaction?.effects?.balanceChanges : transaction?.kind?.commands;
    if (!conn) throw new Error(`popular: no ${field} for transaction ${digest}`);
    out.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  }
  return out;
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1. Bonding curves. `sui_amount` / `quote_amount` is the trade size the fee shares apply to (a buy's payment
  //    including the fee, a sell's proceeds before it); `fee` is what was charged.
  const taxAt = await taxResolver();
  const curveTrades = async (type: string, amountField: string, coinOf: (curveId: string) => Promise<string>) => {
    for (const { json, pos } of await eventsInWindow(type, options)) {
      const coin = await coinOf(json.curve_id);
      const fee = BigInt(json.fee);
      const tax = await taxAt(json.curve_id, pos);
      const s = feeShares(fee, BigInt(json[amountField]), tax, json.referrer != null);
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
    for (const { json } of await eventsInWindow(type, options)) {
      const coin = await coinOf(json);
      dailyFees.add(coin, BigInt(json.creator_fee) + BigInt(json.platform_fee), LABELS.graduation);
      dailyRevenue.add(coin, json.platform_fee, REVENUE.graduation);
      dailySupplySideRevenue.add(coin, json.creator_fee, SUPPLY.graduation);
    }
  };
  await graduations(`${POPULAR}::graduation::Graduated`, async () => ADDRESSES.sui.SUI);
  await graduations(`${QUOTE}::qgraduation::QuoteGraduated`, (json) => quoteCoinOf(json.curve_id));

  // 3. Lending, from repayment and default events. A repaid loan's whole interest is a fee: POPULAR's share
  //    (`platform_cut`, 10%) is revenue, the rest goes to the lender. A defaulted P2P loan pays POPULAR a cut of the
  //    collateral. Those cuts reach the fee wallet in the same transactions; step 4 subtracts them from its receipts.
  // What step 3 already counted per transaction and coin, so step 4 adds only the rest of the fee-wallet receipt.
  const counted: Record<string, Record<string, bigint>> = {};
  const markCounted = (digest: string, coin: string, amount: bigint) => {
    const byCoin = (counted[digest] ??= {});
    byCoin[coin] = (byCoin[coin] ?? 0n) + amount;
  };
  const repayments: [string, number][] = [[`${LEND}::loan::LoanRepaid`, 1], [`${LEND}::safe::SafeRepaid`, 0]]; // index of the loan coin in the type
  for (const [type, loanCoinArg] of repayments) {
    for (const e of await eventsInWindow(type, options)) {
      const coin = typeArgs(e.type)[loanCoinArg];
      const interest = BigInt(e.json.interest), cut = BigInt(e.json.platform_cut);
      dailyFees.add(coin, interest, LABELS.interest);
      dailyRevenue.add(coin, cut, REVENUE.interest);
      dailySupplySideRevenue.add(coin, interest - cut, SUPPLY.lenders);
      markCounted(e.digest, coin, cut);
    }
  }
  for (const e of await eventsInWindow(`${LEND}::loan::LoanDefaulted`, options)) {
    const coin = typeArgs(e.type)[0]; // the collateral coin
    dailyFees.add(coin, e.json.platform_cut, LABELS.defaults);
    dailyRevenue.add(coin, e.json.platform_cut, REVENUE.defaults);
    markCounted(e.digest, coin, BigInt(e.json.platform_cut));
  }

  // 4. Fees paid straight to POPULAR's fee wallet: the 0.3% fee on trades routed through the site (DEX aggregator
  //    routes, other launchpads' curves, index tokens), OTC, lending open fees, launch fees and gas-sponsorship fees in
  //    users' transactions, and in the keeper's transactions POPULAR's share of open-vault pool fees, lending fees on
  //    sold collateral and the fee of the orders it fills.
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
          digest
          sender { address }
          gasInput { gasSponsor { address } }
          effects { status balanceChanges(first: 50) { pageInfo { hasNextPage endCursor } nodes { owner { address } amount coinType { repr } } } }
          kind { ... on ProgrammableTransaction { commands(first: 50) { pageInfo { hasNextPage endCursor } nodes { ... on MoveCallCommand { function { module { package { address } } } } } } } }
        }
      }
    }`, { after });
    for (const tx of transactions.nodes) {
      if (tx.effects?.status !== "SUCCESS") continue;
      const sender = tx.sender?.address;
      if (!sender || OWN_WALLETS.has(sender)) continue;

      const commandsConn = tx.kind?.commands;
      const commands = [...nodesOf(commandsConn)];
      if (commandsConn?.pageInfo?.hasNextPage) commands.push(...await restOf(tx.digest, "commands", commandsConn.pageInfo.endCursor));
      const packages = [...new Set<string>(commands.filter((c: any) => c.function).map((c: any) => c.function.module.package.address))];

      let label: string, revenueLabel: string;
      if (sender === KEEPER) {
        if (!await callsAny(packages, KEEPER_FEE_FAMILIES)) continue;
        [label, revenueLabel] = [LABELS.keeper, REVENUE.keeper];
      } else {
        const sponsored = tx.gasInput?.gasSponsor?.address === GAS_SPONSOR;
        if (!sponsored && !await callsAny(packages, SITE_FEE_FAMILIES)) continue;
        [label, revenueLabel] = [LABELS.site, REVENUE.site];
      }

      const changesConn = tx.effects.balanceChanges;
      const changes = [...nodesOf(changesConn)];
      if (changesConn?.pageInfo?.hasNextPage) changes.push(...await restOf(tx.digest, "balanceChanges", changesConn.pageInfo.endCursor));
      for (const change of changes) {
        if (change.owner?.address !== FEE_WALLET || BigInt(change.amount) <= 0n) continue;
        const coin = shortType(change.coinType.repr);
        let amount = BigInt(change.amount);
        const already = counted[tx.digest]?.[coin] ?? 0n;
        if (already > 0n) {
          const used = already < amount ? already : amount;
          counted[tx.digest][coin] = already - used;
          amount -= used;
        }
        if (amount <= 0n) continue;
        dailyFees.add(coin, amount, label);
        dailyRevenue.add(coin, amount, revenueLabel);
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
  Fees: "Trading fees on POPULAR's bonding curves (1% plus any creator tax and the anti-snipe fee of a launch's first seconds), the 1% graduation fee when a curve moves to its Cetus pool, interest on repaid loans and default fees of POPULAR lending, and fees paid to POPULAR's fee wallet in transactions that use the site's venues: the site's fee on trades it routes (DEX aggregator, other launchpads' curves, index tokens), OTC, lending open, launch and gas-sponsorship fees, and POPULAR's share of open-vault pool fees. Pool fees earned by liquidity providers on DEXes are not included.",
  UserFees: "All fees are paid by traders, launchers and borrowers.",
  Revenue: "POPULAR's share: 0.3% of curve trades (0.25% with a referrer) and half of the anti-snipe fee, 0.4% of a graduating raise, 10% of lending interest and the default fee, and everything paid to its fee wallet.",
  ProtocolRevenue: "All revenue goes to POPULAR's treasury and fee wallet.",
  SupplySideRevenue: "Curve fees to creators (0.5% plus the creator tax, routed by the token's fee mode to the creator, buyback and burn or holders), to the graduated pool's liquidity (0.1%), to referrers (0.1%) and to the trading season rewards pool (0.1% and half of the anti-snipe fee), 0.6% of a graduating raise to the creator, and 90% of lending interest to lenders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  // Every source is read by timestamp (events) or by checkpoint range (fee-wallet transactions), so any window works.
  pullHourly: true,
  chains: [CHAIN.SUI],
  start: "2026-09-15",
  fetch,
  methodology,
  breakdownMethodology: {
    Fees: {
      [LABELS.curve]: "Fees charged on buys and sells against POPULAR bonding curves (`curve::Traded`, `qcurve::QuoteTraded` events).",
      [LABELS.graduation]: "1% of the raise taken when a curve graduates to Cetus (`graduation::Graduated` events).",
      [LABELS.interest]: "Interest paid on repaid loans, P2P and vault (`loan::LoanRepaid`, `safe::SafeRepaid` events).",
      [LABELS.defaults]: "POPULAR's cut of a defaulted P2P loan's collateral (`loan::LoanDefaulted` events).",
      [LABELS.site]: "Coins received by POPULAR's fee wallet in users' transactions that call a venue the site trades through (Cetus aggregator, Blast, SuiPump, Perpsplexity) or a POPULAR mainnet package, or that POPULAR's gas sponsor paid for: site trading fees, OTC, lending open, launch and gas-sponsorship fees. Lending cuts already counted from repayment events are subtracted.",
      [LABELS.keeper]: "POPULAR's share of open-vault pool fees, lending fees on sold collateral, and the fee of limit, stop and DCA orders, received by the fee wallet in the keeper's transactions.",
    },
    Revenue: {
      [REVENUE.curve]: "Platform share of curve trading fees, kept in POPULAR's treasury.",
      [REVENUE.graduation]: "0.4% of a graduating raise.",
      [REVENUE.interest]: "POPULAR's 10% of the interest on repaid loans.",
      [REVENUE.defaults]: "All lending default fees.",
      [REVENUE.site]: "All site trading and service fees.",
      [REVENUE.keeper]: "All of these keeper-collected fees.",
    },
    SupplySideRevenue: {
      [SUPPLY.creator]: "Creator share of curve trading fees plus any creator tax.",
      [SUPPLY.liquidity]: "Liquidity bonus added to the token's pool when it graduates.",
      [SUPPLY.referral]: "Referral fees accrued to referrers.",
      [SUPPLY.season]: "Season pool paid out to traders as trading rewards.",
      [SUPPLY.graduation]: "0.6% of a graduating raise, paid to the creator.",
      [SUPPLY.lenders]: "The lender's 90% of the interest on repaid loans.",
    },
  },
};

export default adapter;
