import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getCheckpointBeforeWindow, graphqlCall, queryEventNodesInWindow } from "../../helpers/sui";

// Contracts, events and fee rates: https://popularsui.xyz/data/integrators
const START = "2026-09-15";
const POPULAR = "0x918d32f8a0b349584e96113ec425708374161d4798f8c28d63362602831b33ef"; // SUI bonding curves and graduation
const LAUNCH_OPTIONS = "0x1db1337c289900d612897510ea47baddcb631530463fe1ee381480aefa167ad5"; // creator tax events
const QUOTE = "0xfe9f27187eff1c0d1bb236166df360d0c12be4c0bd99d40ce1d3a51771cbe428"; // curves priced in USDC, wBTC, ETH, XAUM
const LEND = "0xed3220b79cb14da863fe5cb746a3a69a47c1be4080ddc60b63c1defdff98f8c3"; // popular_p2p lending
const CONFIG = "0xc5ebd57da4387a39b5af7cd149242d437c0d195471b4e0534c08d868e77e7015"; // config::Config, holds the curve fee split

const FEE_WALLET = "0x81a73ddedd642dad2dc375110e7cddefc4a52cb872c2f5c2c1e54ebcf798324a";
const KEEPER = "0x39b92261afb72aecca4b5d84443e95c2cfb21d7910b78801d8dfb7daf902b8a1";
// Pays gas for wallets without SUI, which repay it to the fee wallet in the same tx; those txs are skipped.
const GAS_SPONSOR = "0x3a3b5fdc0fd212aa2dd61ab8d1c58bc3741705bc24e5099b2d75aee3263c207d";
const OWN_WALLETS = new Set([
  FEE_WALLET,
  "0x9106a25c0e0093c30a143cbe7ef8ae1f9936720d585d16355d4c39b3834caad6", // deployer
  "0x528b697707a6c9037f98b64c9cf2e76e550b00041dcbf743429b521cf9d164d8", // 2-of-3 multisig
  "0x2258eb58ce26517325f86993635ba15dbde17ffeb179b7066f70d7c0665145ba", // Walrus site publisher
]);

// Fee-wallet receipts count only in txs that call one of these package families (original package ids).
const KEEPER_PACKAGES = new Set([
  "0x6917a02c3efd66fe57f813dc4c06bd030465b1ff6f01011bfa32ad94a2eee020", // bundles and open vaults, e.g. tx 8DLu3oro6157mdhvcQJxZXPvqc8JizSmARWNHPQr1HyM
  "0xb10e2b3a89243649f812d681331565ba6715042b935b6d68d3bbdfacd3060977", // DLMM open vaults, e.g. tx 9u3WDMJnJavGr8JRdwvMD8cvqyUXtRKgTe1KSrk5DmUg
  LEND,
  "0x5ca9b9dcbfef0dc82d04ebaace5c7917f407c208c879fcf2d175c9b59b4c9998", // limit, stop and DCA orders
]);
const USER_PACKAGES = new Set([
  ...KEEPER_PACKAGES,
  POPULAR,
  "0xf332e48e1c3ca49e806ebd3cbca0fdb6de213f5906503cffdd7d74a9f28da3e1", // Amped
  "0x5de2cf01feac4de63e94605f74830741d1a8d56efeccf7c9d795e18c4b95c183", // index tokens
  "0x20ea839b3ddd963aef5bf7cb022b5dc5807a62c78230c59e12a921a01f2d251a", // POP pairs
  "0xf7805603f871976fe85dd3ce5c9c60f7853805ed97f7813c32ea35b398134bf1", // OTC
  "0x33ec64e9bb369bf045ddc198c81adbf2acab424da37465d95296ee02045d2b17", // Cetus aggregator router, e.g. tx 3K84UBi6f7GQx8eWRAa9FA4YwR4CaJv9WdUykz3FRxLp
  "0x9c2cef371c0e80648136f7ae65378ac9476e3fdb860538d00290e6e4f975b192", // Blast launchpad, e.g. tx 4TVzmTPgPNhMFr5MwysjKNxUYnTtskFoFBiaMSFxAdCA
  "0xd70a8d11582fd1997380bc59bfd56a2f9028ebe11da74514ea3d386258d932fc", // Blast fee split
  "0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0", // SuiPump
  "0x7b4163d17ce18b386ee50929ba48fa0a2ecb60304df4b07e26835aa18617cda2", // SuiPump v2
  "0x96a8523e464fdb6c1bb267404621cf47fcd3234d168b724b660995a420b439e3", // SuiPump v3
  "0x97fea95545c04dc73f8174c6195013b100a26e3fa978e7cf8b100a51dfaf8354", // Perpsplexity line 1, e.g. tx EkbTxFVxXMHEUk6Ndk1vsbicihyDk2kxNSWkFWnKevkW
  "0x2649a5407e843c6fd35453e0bd49b364abd8e9fe89af899c6ab9371a4c26dcde", // Perpsplexity line 1 call package
  "0xaedb8c9a905a778e831aeb4928f660210a7a645925348a7c4ec1cb4a6a3fd16e", // Perpsplexity line 2
]);

// A called package's family: its own id plus the original ids its types were defined in.
const families: Record<string, Promise<string[]>> = {};
const familiesOf = (pkg: string) => families[pkg] ??= graphqlCall(`{ package(address: "${pkg}") { typeOrigins { definingId } } }`)
  .then(({ package: p }: any) => {
    if (!p) throw new Error(`popular: no package ${pkg}`);
    return [pkg, ...(p.typeOrigins ?? []).map((t: any) => t.definingId)];
  });
async function callsAny(packages: string[], allowed: Set<string>) {
  for (const pkg of packages) if ((await familiesOf(pkg)).some((f) => allowed.has(f))) return true;
  return false;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
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

type FeeParams = { trade: bigint; creator: bigint; liquidity: bigint; season: bigint; referral: bigint };

async function feeParamsAt(checkpoint: number): Promise<FeeParams> {
  const { checkpoint: cp } = await graphqlCall(`{ checkpoint(sequenceNumber: ${checkpoint}) { query { object(address: "${CONFIG}") { asMoveObject { contents { json } } } } } }`);
  const p = cp?.query?.object?.asMoveObject?.contents?.json?.params;
  if (!p) throw new Error(`popular: no fee config at checkpoint ${checkpoint}`);
  return { trade: BigInt(p.trade_fee_bps), creator: BigInt(p.creator_bps), liquidity: BigInt(p.liquidity_bps), season: BigInt(p.season_bps), referral: BigInt(p.referral_bps) };
}

// Mirrors `curve::fee_shares`: platform gets what the base fee leaves after creator, liquidity, referral and season;
// a referrer's share comes half from platform, half from season. Above base fee and creator tax is the anti-snipe
// penalty, split half season, half platform.
function feeShares(fee: bigint, tradeSize: bigint, taxBps: bigint, withReferrer: boolean, p: FeeParams) {
  const bps = (rate: bigint) => (tradeSize * rate) / 10_000n;
  const base = min(bps(p.trade), fee);
  const tax = min(bps(taxBps), fee - base);
  const penalty = fee - base - tax;
  let left = base;
  const creator = min(bps(p.creator), left);
  left -= creator;
  const liquidity = min(bps(p.liquidity), left);
  left -= liquidity;
  const referral = withReferrer ? min(bps(p.referral), left) : 0n;
  left -= referral;
  const season = min(bps(p.season) - (withReferrer ? bps(p.referral / 2n) : 0n), left);
  const platform = left - season;
  const penaltySeason = penalty / 2n;
  return { creator: creator + tax, liquidity, referral, season: season + penaltySeason, platform: platform + penalty - penaltySeason };
}

// Creator tax is set at launch and can only be lowered, so a trade pays the lowest value set by then.
async function creatorTaxes(options: FetchOptions) {
  const sinceLaunch = { startTimestamp: Date.parse(START) / 1e3, endTimestamp: options.endTimestamp };
  const steps: Record<string, { timestamp: number; bps: bigint }[]> = {};
  for (const e of await queryEventNodesInWindow(`${LAUNCH_OPTIONS}::curve::LaunchConfigured`, sinceLaunch))
    (steps[e.json.curve_id] ??= []).push({ timestamp: e.timestamp, bps: BigInt(e.json.creator_tax_bps) });
  for (const e of await queryEventNodesInWindow(`${LAUNCH_OPTIONS}::curve::CreatorTaxLowered`, sinceLaunch))
    (steps[e.json.curve_id] ??= []).push({ timestamp: e.timestamp, bps: BigInt(e.json.to_bps) });
  return (curveId: string, timestamp: number) => {
    const set = (steps[curveId] ?? []).filter((s) => s.timestamp <= timestamp).map((s) => s.bps);
    return set.length ? set.reduce(min) : 0n;
  };
}

const quoteCoins: Record<string, Promise<string>> = {};
const quoteCoinOf = (curveId: string) => quoteCoins[curveId] ??= graphqlCall(`{ object(address: "${curveId}") { asMoveObject { contents { type { repr } } } } }`)
  .then(({ object }: any) => {
    const repr: string = object?.asMoveObject?.contents?.type?.repr ?? "";
    if (!repr.includes("::qcurve::QCurve<")) throw new Error(`popular: no quote coin for curve ${curveId}`);
    return typeArgs(repr)[1];
  });

// A transaction's balance changes or commands past the first page of 50.
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

const LABELS = {
  curve: "Bonding curve trading fees",
  graduation: "Graduation fees",
  interest: "Lending interest",
  defaults: "Lending default fees",
  site: "Site trading and service fees",
  keeper: "Open vault, lending and order fees",
};
const SUPPLY = {
  creator: "Curve fees to creators",
  liquidity: "Curve fees to graduated pool liquidity",
  referral: "Curve fees to referrers",
  season: "Curve fees to trading season rewards",
  graduation: "Graduation fees to creators",
  lenders: "Lending interest to lenders",
};
const REVENUE = {
  curve: "Bonding curve trading fees to POPULAR",
  graduation: "Graduation fees to POPULAR",
  interest: "Lending interest to POPULAR",
  defaults: "Lending default fees to POPULAR",
  site: "Site trading and service fees to POPULAR",
  keeper: "Open vault, lending and order fees to POPULAR",
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [{ sequenceNumber: fromCp }, { sequenceNumber: toCp }] = await Promise.all([
    getCheckpointBeforeWindow(options.startTimestamp),
    getCheckpointBeforeWindow(options.endTimestamp),
  ]);

  // `sui_amount` / `quote_amount` is the trade size the fee shares apply to, `fee` what was charged.
  const params = await feeParamsAt(toCp);
  const taxAt = await creatorTaxes(options);
  const curveTrades = async (type: string, amountField: string, coinOf: (curveId: string) => Promise<string>) => {
    for (const { json, timestamp } of await queryEventNodesInWindow(type, options)) {
      const coin = await coinOf(json.curve_id);
      const fee = BigInt(json.fee);
      const s = feeShares(fee, BigInt(json[amountField]), taxAt(json.curve_id, timestamp), json.referrer != null, params);
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

  // POPULAR's lending cuts also land in the fee wallet in the same tx; they are subtracted from its receipts below.
  // Loans POPULAR's own wallets borrow are self-paid and skipped.
  const lendingCuts: Record<string, bigint> = {};
  const addCut = (digest: string, coin: string, cut: bigint) => { lendingCuts[`${digest}:${coin}`] = (lendingCuts[`${digest}:${coin}`] ?? 0n) + cut; };
  const repayments: [string, number][] = [[`${LEND}::loan::LoanRepaid`, 1], [`${LEND}::safe::SafeRepaid`, 0]]; // index of the loan coin
  for (const [eventType, loanCoinArg] of repayments) {
    for (const { json, type, digest } of await queryEventNodesInWindow(eventType, options)) {
      if (OWN_WALLETS.has(json.borrower)) continue;
      const coin = typeArgs(type)[loanCoinArg];
      const interest = BigInt(json.interest), cut = BigInt(json.platform_cut);
      dailyFees.add(coin, interest, LABELS.interest);
      dailyRevenue.add(coin, cut, REVENUE.interest);
      dailySupplySideRevenue.add(coin, interest - cut, SUPPLY.lenders);
      addCut(digest, coin, cut);
    }
  }
  for (const { json, type, digest } of await queryEventNodesInWindow(`${LEND}::loan::LoanDefaulted`, options)) {
    if (OWN_WALLETS.has(json.borrower)) continue;
    const coin = typeArgs(type)[0]; // collateral coin
    dailyFees.add(coin, json.platform_cut, LABELS.defaults);
    dailyRevenue.add(coin, json.platform_cut, REVENUE.defaults);
    addCut(digest, coin, BigInt(json.platform_cut));
  }

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
      const sender = tx.sender?.address;
      if (tx.effects?.status !== "SUCCESS" || !sender || OWN_WALLETS.has(sender)) continue;
      if (tx.gasInput?.gasSponsor?.address === GAS_SPONSOR) continue;

      const commandsConn = tx.kind?.commands;
      const commands = [...(commandsConn?.nodes ?? [])];
      if (commandsConn?.pageInfo?.hasNextPage) commands.push(...await restOf(tx.digest, "commands", commandsConn.pageInfo.endCursor));
      const packages = [...new Set<string>(commands.filter((c: any) => c.function).map((c: any) => c.function.module.package.address))];

      const isKeeper = sender === KEEPER;
      if (!await callsAny(packages, isKeeper ? KEEPER_PACKAGES : USER_PACKAGES)) continue;
      const [label, revenueLabel] = isKeeper ? [LABELS.keeper, REVENUE.keeper] : [LABELS.site, REVENUE.site];

      const changesConn = tx.effects.balanceChanges;
      const changes = [...(changesConn?.nodes ?? [])];
      if (changesConn?.pageInfo?.hasNextPage) changes.push(...await restOf(tx.digest, "balanceChanges", changesConn.pageInfo.endCursor));
      for (const change of changes) {
        if (change.owner?.address !== FEE_WALLET || BigInt(change.amount) <= 0n) continue;
        const coin = shortType(change.coinType.repr);
        const key = `${tx.digest}:${coin}`;
        const counted = min(lendingCuts[key] ?? 0n, BigInt(change.amount));
        lendingCuts[key] = (lendingCuts[key] ?? 0n) - counted;
        const amount = BigInt(change.amount) - counted;
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
  Fees: "Trading fees on POPULAR bonding curves (1% plus any creator tax and the anti-snipe fee of a launch's first seconds), the 1% graduation fee, interest and default fees on POPULAR lending, and fees paid to POPULAR's fee wallet for trades routed through the site (Cetus aggregator, Blast, SuiPump, Perpsplexity), OTC, index tokens, orders, loan openings, launches and open vaults; excludes gas-sponsored trades and loans taken by POPULAR's own wallets.",
  UserFees: "Fees paid by traders, token launchers, borrowers and open vault depositors.",
  Revenue: "POPULAR's share: 0.3% of curve trades (0.25% with a referrer) plus half of the anti-snipe fee, 0.4% of a graduating raise, 10% of lending interest, lending default fees, and everything paid to its fee wallet.",
  ProtocolRevenue: "POPULAR's share of curve, graduation and lending fees plus everything paid to its fee wallet, kept by POPULAR.",
  SupplySideRevenue: "Curve fees to creators (0.5% plus the creator tax), referrers (0.1%), the trading season rewards pool (0.1% plus half of the anti-snipe fee) and the graduated pool's liquidity (0.1%), 0.6% of a graduating raise to the creator, and 90% of lending interest to lenders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SUI],
  start: START,
  fetch,
  methodology,
  breakdownMethodology: {
    Fees: {
      [LABELS.curve]: "Fees charged on buys and sells against POPULAR bonding curves, including creator tax and the anti-snipe fee.",
      [LABELS.graduation]: "1% of the raise taken when a curve graduates to its Cetus pool.",
      [LABELS.interest]: "Interest paid on repaid P2P and vault loans.",
      [LABELS.defaults]: "POPULAR's cut of a defaulted P2P loan's collateral.",
      [LABELS.site]: "Fees paid to POPULAR's fee wallet in users' transactions: trades routed through the site, OTC, index tokens, orders, loan openings and launches.",
      [LABELS.keeper]: "POPULAR's share of open vault pool fees, lending fees on sold collateral and the fee of orders its keeper fills.",
    },
    Revenue: {
      [REVENUE.curve]: "Platform share of curve trading fees plus half of the anti-snipe fee.",
      [REVENUE.graduation]: "0.4% of a graduating raise.",
      [REVENUE.interest]: "POPULAR's 10% of the interest on repaid loans.",
      [REVENUE.defaults]: "All lending default fees.",
      [REVENUE.site]: "All site trading and service fees.",
      [REVENUE.keeper]: "All open vault, lending and order fees collected by the keeper.",
    },
    SupplySideRevenue: {
      [SUPPLY.creator]: "Creator share of curve trading fees plus any creator tax, routed by the token's fee mode to the creator, a buyback and burn or holders.",
      [SUPPLY.liquidity]: "Share of curve trading fees added to the token's pool when it graduates.",
      [SUPPLY.referral]: "Share of curve trading fees accrued to referrers.",
      [SUPPLY.season]: "Share of curve trading fees and half of the anti-snipe fee paid out to traders as season rewards.",
      [SUPPLY.graduation]: "0.6% of a graduating raise, paid to the creator.",
      [SUPPLY.lenders]: "The lender's 90% of the interest on repaid loans.",
    },
  },
};

export default adapter;
