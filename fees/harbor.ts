import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Live Ethereum markets from Harbor's published address book
// https://docs.harborfinance.io/tech-docs/integrators/addresses-and-abis
// https://docs.harborfinance.io/integrators/addresses/mainnet-v1.json
// Skip relaunch-pending. New live market: copy from that JSON and set start to the
// UTC date of startBlock (or the manager create block if that is later — see usd-*).
// Do not guess start; do not move adapter.start later. Adapter start stays the
// earliest live market (btc-steth 2025-12-19). A later market only needs its own
// entry.start — fetch skips it until that date.
//
// Address book → adapter field, and what we scan from that date:
//   wrappedCollateralToken → wrappedCollateral  minter→OWNER/feeReceiver (mint fees)
//   minter                  → minter             also minter.feeReceiver() each window
//   stabilityPoolManager    → manager            Harvested + harvest ratios (omit if none)
//   peggedToken             → peggedToken        pool→getFeeAddress() ha (early withdraw)
//   stabilityPoolCollateral → poolCollateral     OWNER/feeReceiver→pool (deposits)
//   stabilityPoolLeveraged  → poolLeveraged      same
// feeReceiver / getFeeAddress are read on-chain; do not hardcode. New ha token:
// add HA_PEG (Chainlink peg → WETH/WBTC/EURC/USDC) or fetch throws.
const ZERO = "0x0000000000000000000000000000000000000000";
const WAD = 10n ** 18n;

// Harbor owner Safe. Today mint/redeem fees and the 99% harvest cut land here
// (minter/manager feeReceiver was pointed at this Safe). Sample mint:
// 0xf850b39fd23912fd50a9d6975590172dd09eaa0adedc2151b688ca215481633b
// (21 Aug 2026, btc-steth: 0.0004 wstETH / 0.1% to this wallet).
// harvest() is 1% keeper / 99% cut / 0% on-chain to pools (Harbor "manual" split).
// The team lets harvest accrue and fronts pool rewards from this Safe.
// Later they will point feeReceiver back at per-market wallets and automate
// harvest + depositReward via keepers/cron. Read feeReceiver() each window so
// that switch does not need a code change. Keepers must pull/deposit from the
// Safe or the live feeReceiver — a new intermediate wallet would be missed.
const OWNER = "0x9bABfC1A1952a6ed2caC1922BFfE80c0506364a2";

const HARVESTED_EVENT = "event Harvested(uint256 amount)";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const topicAddress = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;

const YIELDS_TO_POOLS = "Assets Yields To Stability Pools";
const YIELDS_TO_TREASURY = "Assets Yields To Treasury";
const KEEPER_BOUNTY = "Harvest Keeper Bounty";
const MINT_REDEEM_TO_PROTOCOL = "Mint/Redeem Fees To Protocol";
const PROTOCOL_DEPOSITS_TO_POOLS = "Protocol Deposits To Stability Pools";
const EARLY_WITHDRAW_TO_PROTOCOL = "Early Withdrawal Fees To Protocol";

const asAddress = (value?: string) => {
  if (!value) return undefined;
  const hex = value.length === 66 ? `0x${value.slice(-40)}` : value;
  if (hex.toLowerCase() === ZERO.toLowerCase()) return undefined;
  return hex.toLowerCase();
};

const uniqueAddresses = (...values: (string | undefined)[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const addr = asAddress(value);
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out;
};

// ha tokens are not on coins.llama.fi. Count them as the Chainlink peg Harbor uses
// (ETH/USD, BTC/USD, EUR/USD, USD) via a priced canonical token. ha is 18 decimals.
// New markets: add the ha token here. Unmapped ha sits at $0 if added raw; fetch
// throws instead so a missing peg cannot silently store a zero day.
const WETH = "0xC02aaa39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const EURC = "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c"; // Circle EURC — EUR/USD
const HA_DECIMALS = 18n;
const HA_PEG: Record<string, { token: string; decimals: bigint }> = {
  "0x7a53ebc85453dd006824084c4f4be758fcf8a5b5": { token: WETH, decimals: 18n }, // haETH
  "0x25ba4a826e1a1346dca2ab530831dbff9c08bea7": { token: WBTC, decimals: 8n }, // haBTC
  "0x83fd69e0ff5767972b46e61c6833408361bf7346": { token: EURC, decimals: 6n }, // haEUR
  "0x2536a8636a99466173229ab15fdb37fcaa05ba1a": { token: USDC, decimals: 6n }, // haUSD
};

const scaleHaToPeg = (amount: string, outDecimals: bigint) => {
  const value = BigInt(amount);
  if (outDecimals === HA_DECIMALS) return value.toString();
  if (outDecimals > HA_DECIMALS) return (value * (10n ** (outDecimals - HA_DECIMALS))).toString();
  return (value / (10n ** (HA_DECIMALS - outDecimals))).toString();
};

type Market = {
  id: string;
  start: string;
  wrappedCollateral: string;
  minter: string;
  manager?: string;
  peggedToken?: string;
  poolCollateral?: string;
  poolLeveraged?: string;
};

const markets: Market[] = [
  {
    id: "eth-fxusd",
    start: "2025-12-19", // startBlock 24049488
    wrappedCollateral: "0x7743e50F534a7f9F1791DdE7dCD89F7783Eefc39", // fxSAVE
    minter: "0xd6E2F8e57b4aFB51C6fA4cbC012e1cE6aEad989F",
    manager: "0xE39165aDE355988EFb24dA4f2403971101134CAB",
    peggedToken: "0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5",
    poolCollateral: "0x1F985CF7C10A81DE1940da581208D2855D263D72",
    poolLeveraged: "0x438B29EC7a1770dDbA37D792F1A6e76231Ef8E06",
  },
  {
    id: "btc-fxusd",
    start: "2025-12-19", // startBlock 24049375
    wrappedCollateral: "0x7743e50F534a7f9F1791DdE7dCD89F7783Eefc39", // fxSAVE
    minter: "0x33e32ff4d0677862fa31582CC654a25b9b1e4888",
    manager: "0x768E0a386e1972eB5995429Fe21E7aC0f22F516e",
    peggedToken: "0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7",
    poolCollateral: "0x86561cdB34ebe8B9abAbb0DD7bEA299fA8532a49",
    poolLeveraged: "0x9e56F1E1E80EBf165A1dAa99F9787B41cD5bFE40",
  },
  {
    id: "btc-steth",
    start: "2025-12-19", // startBlock 24049273
    wrappedCollateral: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
    minter: "0xF42516EB885E737780EB864dd07cEc8628000919",
    manager: "0x5e9Bcaa1EDfD665c09a9e6693B447581d61A85A1",
    peggedToken: "0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7",
    poolCollateral: "0x667Ceb303193996697A5938cD6e17255EeAcef51",
    poolLeveraged: "0xCB4F3e21DE158bf858Aa03E63e4cEc7342177013",
  },
  {
    // No stabilityPoolManager in the address book — mint/redeem + owner deposits only.
    // Owner deposited wstETH rewards here on 8 Sep 2026 (tx 0xf57d013b…).
    id: "steth-eur",
    start: "2026-01-20", // startBlock 24271147
    wrappedCollateral: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
    minter: "0x68911ea33E11bc77e07f6dA4db6cd23d723641cE",
    peggedToken: "0x83Fd69E0FF5767972b46E61C6833408361bF7346", // haEUR
    poolCollateral: "0x000564B33FFde65E6c3b718166856654e039D69B",
    poolLeveraged: "0x7553fb328ef35aF1c2ac4E91e53d6a6B62DFDdEa",
  },
  {
    // No stabilityPoolManager in the address book — mint/redeem + owner deposits only.
    id: "fxusd-eur",
    start: "2026-01-20", // startBlock 24271147
    wrappedCollateral: "0x7743e50F534a7f9F1791DdE7dCD89F7783Eefc39", // fxSAVE
    minter: "0xDEFB2C04062350678965CBF38A216Cc50723B246",
    peggedToken: "0x83Fd69E0FF5767972b46E61C6833408361bF7346", // haEUR
    poolCollateral: "0xe60054E6b518f67411834282cE1557381f050B13",
    poolLeveraged: "0xc5e0dA7e0a178850438E5E97ed59b6eb2562e88E",
  },
  {
    id: "usd-steth",
    // Manager 0x377a4A6B… created block 25118688 (18 May 2026 01:06 UTC).
    start: "2026-05-18",
    wrappedCollateral: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
    minter: "0xC14837C30BEdF3081cBa2cDeB067fA6F0381e69b",
    manager: "0x377a4A6BEC4C75F2B7054B67Df03ce9A7497c33d",
    peggedToken: "0x2536A8636A99466173229AB15fdb37Fcaa05BA1A",
    poolCollateral: "0xD21613339E8A6adba7a084f67802731e6045d801",
    poolLeveraged: "0x6E7b445e4dac4787445f31382f4E3dCAd510c238",
  },
  {
    id: "usd-wbtc",
    // Manager 0x2506223d… created block 25118640 (18 May 2026 00:56 UTC).
    start: "2026-05-18",
    wrappedCollateral: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
    minter: "0x0aA2b6Ee6D079f39A52725B33B15854505542B51",
    manager: "0x2506223d01072f795487Ff1f67aD40E1D3B15De0",
    peggedToken: "0x2536A8636A99466173229AB15fdb37Fcaa05BA1A",
    poolCollateral: "0xa1959F3dae8C3e7c8825dD7902D30569aF092Ed8",
    poolLeveraged: "0xd16C291456060bF36023D9a935719380a14dE3AD",
  },
];

const harvestMarkets = markets.filter((m): m is Market & { manager: string; peggedToken: string; poolCollateral: string; poolLeveraged: string } =>
  Boolean(m.manager && m.peggedToken && m.poolCollateral && m.poolLeveraged),
);

const getTransfers = async (options: FetchOptions, token: string, from: string, to: string) => {
  if (from === ZERO || to === ZERO) return [];
  return options.getLogs({
    target: token,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, topicAddress(from), topicAddress(to)],
  });
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const liveMarkets = markets.filter((m) => options.dateString >= m.start);
  const managedMarkets = liveMarkets.filter((m): m is Market & { manager: string } => Boolean(m.manager));
  const [minterReceivers, managerReceivers] = await Promise.all([
    options.api.multiCall({
      abi: "address:feeReceiver",
      calls: liveMarkets.map((m) => m.minter),
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: "address:feeReceiver",
      calls: managedMarkets.map((m) => m.manager),
      permitFailure: true,
    }),
  ]);
  const managerReceiverById = Object.fromEntries(managedMarkets.map((m, i) => [m.id, managerReceivers[i]]));

  // Mint events omit the fee amount. Sequential (token, from, to) logs — do not
  // fan out with addTokensReceived. Sink is the Safe today, minter.feeReceiver later.
  for (const [i, market] of liveMarkets.entries()) {
    for (const sink of uniqueAddresses(OWNER, minterReceivers[i])) {
      const logs = await getTransfers(options, market.wrappedCollateral, market.minter, sink);
      for (const log of logs) {
        dailyFees.add(market.wrappedCollateral, log.value, METRIC.MINT_REDEEM_FEES);
        dailyUserFees.add(market.wrappedCollateral, log.value, METRIC.MINT_REDEEM_FEES);
        dailyRevenue.add(market.wrappedCollateral, log.value, MINT_REDEEM_TO_PROTOCOL);
      }
    }
  }

  // Protocol wallet → pool depositReward (Safe today, feeReceiver + keepers later).
  // Not new fees: reclassify revenue to supply side. Often a different day than harvest().
  const seenDeposit = new Set<string>();
  for (const [i, market] of liveMarkets.entries()) {
    const sinks = uniqueAddresses(OWNER, minterReceivers[i], managerReceiverById[market.id]);
    for (const pool of [market.poolCollateral, market.poolLeveraged]) {
      if (!pool) continue;
      for (const sink of sinks) {
        const key = `${market.wrappedCollateral}:${sink}:${pool}`.toLowerCase();
        if (seenDeposit.has(key)) continue;
        seenDeposit.add(key);
        const logs = await getTransfers(options, market.wrappedCollateral, sink, pool);
        for (const log of logs) {
          dailySupplySideRevenue.add(market.wrappedCollateral, log.value, PROTOCOL_DEPOSITS_TO_POOLS);
          dailyRevenue.add(market.wrappedCollateral, `-${log.value}`, PROTOCOL_DEPOSITS_TO_POOLS);
        }
      }
    }
  }

  // Early-withdrawal fee: pool transfers ha (ASSET_TOKEN) to getFeeAddress()
  // when a user withdraws outside the requested window.
  // https://docs.harborfinance.io/tech-docs/contracts/stability-pool
  const poolLegs: { token: string; pool: string }[] = [];
  for (const market of liveMarkets) {
    if (!market.peggedToken) continue;
    for (const pool of [market.poolCollateral, market.poolLeveraged]) {
      if (pool) poolLegs.push({ token: market.peggedToken, pool });
    }
  }
  const poolFeeAddresses = poolLegs.length === 0 ? [] : await options.api.multiCall({
    abi: "address:getFeeAddress",
    calls: poolLegs.map((leg) => leg.pool),
    permitFailure: true,
  });
  const seenWithdrawFee = new Set<string>();
  for (const [i, leg] of poolLegs.entries()) {
    const feeAddress = asAddress(poolFeeAddresses[i]);
    if (!feeAddress) continue;
    const key = `${leg.token}:${leg.pool}:${feeAddress}`;
    if (seenWithdrawFee.has(key)) continue;
    seenWithdrawFee.add(key);
    const peg = HA_PEG[leg.token.toLowerCase()];
    // Unmapped ha has no Llama price — would record $0. Fail the window instead.
    if (!peg) throw new Error(`Harbor: unmapped ha token ${leg.token} (add HA_PEG or it prices at $0)`);
    const logs = await getTransfers(options, leg.token, leg.pool, feeAddress);
    for (const log of logs) {
      const priced = scaleHaToPeg(log.value, peg.decimals);
      dailyFees.add(peg.token, priced, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyUserFees.add(peg.token, priced, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyRevenue.add(peg.token, priced, EARLY_WITHDRAW_TO_PROTOCOL);
    }
  }

  const liveHarvest = harvestMarkets.filter((m) => options.dateString >= m.start);
  if (liveHarvest.length === 0) {
    return {
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue.clone(),
      dailySupplySideRevenue,
    };
  }

  const managers = liveHarvest.map((m) => m.manager);
  const [harvestLogs, bountyRatios, cutRatios, collateralHoldings, sailHoldings] = await Promise.all([
    options.getLogs({
      targets: managers,
      eventAbi: HARVESTED_EVENT,
      flatten: false,
    }),
    // USD managers were created mid-day 18 May 2026; earlier hours that day have no code.
    options.api.multiCall({
      abi: "uint256:harvestBountyRatio",
      calls: managers,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: "uint256:harvestCutRatio",
      calls: managers,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: "erc20:balanceOf",
      calls: liveHarvest.map((m) => ({ target: m.peggedToken, params: [m.poolCollateral] })),
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: "erc20:balanceOf",
      calls: liveHarvest.map((m) => ({ target: m.peggedToken, params: [m.poolLeveraged] })),
      permitFailure: true,
    }),
  ]);

  liveHarvest.forEach((market, i) => {
    if (bountyRatios[i] == null || cutRatios[i] == null) return;
    const bountyRatio = BigInt(bountyRatios[i]);
    const cutRatio = BigInt(cutRatios[i]);
    // Remainder is 0 while cut+bounty = 100%. If both pools are empty, leftover goes to TREASURY.
    const poolsEmpty = BigInt(collateralHoldings[i] ?? 0) === 0n && BigInt(sailHoldings[i] ?? 0) === 0n;

    for (const log of harvestLogs[i] ?? []) {
      const harvested = BigInt(log.amount);
      const bounty = (harvested * bountyRatio) / WAD;
      const cut = (harvested * cutRatio) / WAD;
      const remainder = harvested - bounty - cut;

      dailyFees.add(market.wrappedCollateral, harvested.toString(), METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(market.wrappedCollateral, bounty.toString(), KEEPER_BOUNTY);
      dailyRevenue.add(market.wrappedCollateral, cut.toString(), YIELDS_TO_TREASURY);
      if (poolsEmpty) {
        dailyRevenue.add(market.wrappedCollateral, remainder.toString(), YIELDS_TO_TREASURY);
      } else {
        dailySupplySideRevenue.add(market.wrappedCollateral, remainder.toString(), YIELDS_TO_POOLS);
      }
    }
  });

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Mint and redeem fees paid by users, stability-pool early-withdrawal fees paid in ha (valued at the Chainlink ETH/BTC/EUR/USD peg), plus collateral yield harvested from fxSAVE and wstETH. Excludes off-chain TIDE buybacks. Harvested wstETH and fxSAVE yield is also counted by Lido and f(x) Protocol.",
  Revenue: "Mint and redeem fees, early-withdrawal fees, and the harvest cut held by the owner Safe or market feeReceiver, minus wrapped collateral those wallets later deposit into stability pools.",
  ProtocolRevenue: "Same as revenue. TIDE buybacks are not counted until they happen on-chain.",
  SupplySideRevenue: "Wrapped collateral the owner Safe or feeReceiver deposits into stability pools, any on-chain harvest remainder, and the harvest keeper bounty.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: "Fees paid by users when minting or redeeming ha or hs, taken in wrapped collateral and sent to the owner Safe or the minter feeReceiver.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Early-withdrawal fees deducted from ha when a user leaves a stability pool outside the requested withdrawal window, sent to the pool fee address. Valued as the Chainlink peg (haETH→ETH, haBTC→BTC, haEUR→EUR, haUSD→USD).",
    [METRIC.ASSETS_YIELDS]: "Gross collateral yield realized when harvest is called on a stability pool manager (fxSAVE or wstETH appreciation), including automated keeper harvests. Also counted by Lido and f(x) Protocol.",
  },
  Revenue: {
    [MINT_REDEEM_TO_PROTOCOL]: "Mint and redeem fees sitting at the owner Safe or minter feeReceiver.",
    [EARLY_WITHDRAW_TO_PROTOCOL]: "Early-withdrawal fees sent to each pool's getFeeAddress.",
    [YIELDS_TO_TREASURY]: "Harvest cut (harvestCutRatio, 99% today) sent to the manager feeReceiver, plus leftover harvest when both stability pools are empty.",
    [PROTOCOL_DEPOSITS_TO_POOLS]: "Deposits from the Safe or feeReceiver into stability pools, subtracted from revenue on the deposit day (can be fronted before harvest, including automated keepers).",
  },
  ProtocolRevenue: {
    [MINT_REDEEM_TO_PROTOCOL]: "Mint and redeem fees sitting at the owner Safe or minter feeReceiver.",
    [EARLY_WITHDRAW_TO_PROTOCOL]: "Early-withdrawal fees sent to each pool's getFeeAddress.",
    [YIELDS_TO_TREASURY]: "Harvest cut sent to the manager feeReceiver, plus leftover harvest when both stability pools are empty.",
    [PROTOCOL_DEPOSITS_TO_POOLS]: "Deposits from the Safe or feeReceiver into stability pools, subtracted from protocol revenue on the deposit day.",
  },
  SupplySideRevenue: {
    [PROTOCOL_DEPOSITS_TO_POOLS]: "Wrapped collateral deposited into collateral and Sail stability pools from the owner Safe or feeReceiver. Today these are fronted manually; later they may be automated keepers pulling from the feeReceiver.",
    [YIELDS_TO_POOLS]: "On-chain harvest remainder deposited into pools. Unused while harvest cut plus bounty is 100%.",
    [KEEPER_BOUNTY]: "Share of each harvest paid to the caller (harvestBountyRatio, 1% today).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  // Existing DefiLlama listing https://defillama.com/protocol/harbor also has MegaETH
  // (~$1 TVL). Fees are Ethereum-only; no MegaETH harvest/mint fee path is tracked.
  // Earliest live startBlock in the address book is btc-steth 24049273 (19 Dec 2025).
  start: "2025-12-19",
  methodology,
  breakdownMethodology,
  // Harvested wstETH/fxSAVE yield overlaps Lido and f(x) (stated in methodology).
  // Do not set doublecounted: that flag is adapter-wide and would also drop
  // Harbor-only mint/redeem and early-withdrawal fees from category totals.
  // Protocol wallets may deposit (front) rewards into pools on a different day than harvest/mint fees.
  allowNegativeValue: true,
};

export default adapter;
