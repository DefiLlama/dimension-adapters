import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addQuote, STONKBROKER } from "../stonkbrokers/helpers";

/**
 * StonkBrokers Safe Launch / Stonklauncher — token launchpads on Robinhood Chain.
 *
 * Fee sources:
 * 1. Safe Launch / Stonklauncher pads (public go-live 2026-08-17, V2 live
 *    2026-08-21/22, r2/"v3" pad generation 2026-08-23): every window buy/sell
 *    pays the decaying snipe tax, split 16.5% launch creator / 16.5% protocol
 *    accrual / 50% locked-LP reserve (or ICO Bonus kickstarter on degen modes)
 *    / 17% StockBooster via the Clock In Card (~0.5% of tax to the referrer).
 *    Covers the V1 ETH pad, all V1 quoted lanes, all V2 lanes, and all r2
 *    lanes. Quoted-lane amounts are denominated in the lane's quote token
 *    (STONK / USDG / WETH / tokenized stocks), not native ETH.
 * 2. Anti-snipe fair-launch tooling: time-decay snipe tax on launch-curve
 *    buys (starts at 99% and falls 1%/minute over a 99-minute window), split
 *    90% StockBooster / 10% launch dev. First production launch: Card Wall
 *    ($WALL), 2026-08-14 — raise bonded into permanently locked LP, so the tax
 *    is the only extractable fee leg.
 * 3. Stonk Launcher bonding-curve factory (closed; residual trading): 1%
 *    trade fee on StonkCurvePool, waterfall 33/33/33 creator / protocol /
 *    StonkBrokers (Directed Clock In + jackpot pot).
 *
 * Volume: window buys AND sells on every pad generation (buy = tax-inclusive
 * quote in; sell = net quote out + tax), anti-snipe launch buys
 * (WallBought.ethIn), and StonkCurvePool Trade.quoteAmount.
 */

// Anti-snipe fair-launch instances (WallFairLaunch-style time-decay snipe-tax
// curves). Each launch is a standalone one-off contract; append new instances
// here as they go live. boosterFeeBps = 9000 on-chain (90% StockBooster /
// 10% launch dev), read from the deployed instance.
const ANTI_SNIPE_LAUNCHES = [
  "0xEa371F8122630d05352Cf15b608402DB2069bdd6", // Card Wall ($WALL), 2026-08-14
];
const LAUNCH_BOOSTER_BPS = 9000n;

// Safe Launch / Stonklauncher pads. quote=null → native ETH (legacy ETH pad);
// otherwise amounts in SafeBuy/SafeSell are the lane's quote token (field
// names stay ethIn/ethOut on-chain). ClockInCard punches ride the tax split
// — do NOT also read card events (double-count).
const QUOTE = {
  WETH: ADDRESSES.robinhood.WETH,
  STONK: STONKBROKER,
  USDG: ADDRESSES.robinhood.USDG,
  GME: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E",
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
  SPCX: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
  USO: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344",
} as const;

type SafePad = { addr: string; quote: string | null; gen: "v1-eth" | "v1-quoted" | "v2" | "r2" };

const SAFE_LAUNCH_PADS: SafePad[] = [
  // V1 ETH pad (native ETH amounts)
  { addr: "0xEcA5726dae1e53365c37fFc02369d947A91d71f9", quote: null, gen: "v1-eth" },
  // V1 quoted lanes (StonkSafeLaunchpadQuoted)
  { addr: "0x77103B69f680BCd3df75F7D7ed3a67030130736a", quote: QUOTE.STONK, gen: "v1-quoted" },
  { addr: "0xa70A17f5522Bb0c701380Df1b0897b4BE5161564", quote: QUOTE.USDG, gen: "v1-quoted" },
  { addr: "0xbAb114C56d12d26e901D0f14B4583Cc0a02537b4", quote: QUOTE.GME, gen: "v1-quoted" },
  { addr: "0x2e512f316751589eB521B7c55Ee9E824ABb80B8E", quote: QUOTE.NVDA, gen: "v1-quoted" },
  { addr: "0xFDEb6d19354ed2eB905bfB9899086A5270302eF3", quote: QUOTE.AAPL, gen: "v1-quoted" },
  { addr: "0xcCfe8A38D0C1ba104E362eDCf85DAda11de2Ae62", quote: QUOTE.SPCX, gen: "v1-quoted" },
  { addr: "0xd31228e555d0759ed627E3249Ab6F7C286b9B8af", quote: QUOTE.USO, gen: "v1-quoted" },
  { addr: "0xABEa69101B2a19347A34339F24cAD8b9523E9c29", quote: QUOTE.WETH, gen: "v1-quoted" },
  // V2 lanes (StonkSafeLaunchpadV2, opened 2026-08-21/22)
  { addr: "0xFCd61B25BbF3AbD6cf0070D6328E351cc30EEC9f", quote: QUOTE.WETH, gen: "v2" },
  { addr: "0x8f6782c5Aa37804d08a9b7bf3984Ff3245Fd6cD4", quote: QUOTE.STONK, gen: "v2" },
  { addr: "0xd4F20033586977A2511f4A2DB4aF7C79a340D70a", quote: QUOTE.USDG, gen: "v2" },
  { addr: "0x4B9Dcd6CCFAeF0f6D23065Dd78E79d5E20ec8cFD", quote: QUOTE.GME, gen: "v2" },
  { addr: "0xEe96d955d5634813374ecE4C74F2C0ff71B1F9fB", quote: QUOTE.NVDA, gen: "v2" },
  { addr: "0xB0453A81Cbf963903409FFF18AD92941e1c7a864", quote: QUOTE.AAPL, gen: "v2" },
  { addr: "0x0c3b4EDED41696eFF0ed70841f132B519d81c947", quote: QUOTE.SPCX, gen: "v2" },
  { addr: "0xDb3C81C841ff88db6cDFbDDB0eE049D162A6053B", quote: QUOTE.USO, gen: "v2" },
  // r2 / "v3" pad generation (abort() C-01 patch, BYO path, 2026-08-23)
  { addr: "0x5BCEefBa6fDf437A7388aDC5c9056c827baca3B3", quote: QUOTE.WETH, gen: "r2" },
  { addr: "0x406fd0B957bb8cF1dd57C78540D009578e971131", quote: QUOTE.STONK, gen: "r2" },
  { addr: "0xF0A06Ac7BBb0cc3049B68c257c3ee27CcEA40eeA", quote: QUOTE.USDG, gen: "r2" },
  { addr: "0x5b21F8a5Ef81586627B4725844aD447325d0992B", quote: QUOTE.GME, gen: "r2" },
  { addr: "0xDf03953DCA8dB733345278A0c5fd2E81fa2A9B54", quote: QUOTE.NVDA, gen: "r2" },
  { addr: "0xc522DfaE0D1a140257702392B665183a6De7657f", quote: QUOTE.AAPL, gen: "r2" },
  { addr: "0xd82da1D8ef59959b170b59147283Ab1F2F1Ca86A", quote: QUOTE.SPCX, gen: "r2" },
  { addr: "0x644b19512052A1b6d38d7B16C6c3Fb1d3F7270D2", quote: QUOTE.USO, gen: "r2" },
];
const SAFE_PAD_TARGETS = SAFE_LAUNCH_PADS.map((p) => p.addr);
// Production tax split, applied by the go-live `setFeeSplit(1650, 1650, 5000)`
// and snapshotted into every launch: creator / protocol / locked-LP reserve,
// remainder (1700) punches through the Clock In Card → ~0.5% of tax to the
// referrer, the rest to StockBooster Clock In dividends.
const SAFE_CREATOR_BPS = 1650n;
const SAFE_PROTOCOL_BPS = 1650n;
const SAFE_LP_BPS = 5000n;

// Bonding-curve Stonk Launcher factory (closed; residual curve trading).
const LAUNCHER_FACTORY = "0x80a77001456bc986083678F9a112B1EC2Aa07281";
const LAUNCHER_FACTORY_START = 34_876_725; // 2026-08-12
const LAUNCHER_CREATOR_BPS = 3333n;
const LAUNCHER_STONK_BPS = 3333n;
// protocol = 10000 - 3333 - 3333 = 3334

const WALL_BOUGHT =
  "event WallBought(address indexed buyer, uint256 ethIn, uint256 taxPaid, uint256 taxBps, uint256 tokensOut, uint256 mcapUsd8)";
const SAFE_BUY =
  "event SafeBuy(uint256 indexed id, address indexed buyer, uint256 ethIn, uint256 taxPaid, uint256 taxBps, uint256 tokensOut, uint256 mcapUsd8)";
const SAFE_SELL =
  "event SafeSell(uint256 indexed id, address indexed seller, uint256 tokensIn, uint256 taxPaid, uint256 taxBps, uint256 ethOut, uint256 mcapUsd8)";
const TOKEN_LAUNCHED =
  "event TokenLaunched(address indexed creator, address indexed memeToken, address indexed pool, string name, string symbol, string metadataURI, bytes32 imageHash)";
const CURVE_TRADE =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 feeAmount, uint256 newRealQuote, uint256 newSold)";

const LABELS = {
  LAUNCH_TAX: "Anti-snipe launch tax (time-decay snipe tax on curve buys)",
  LAUNCH_TAX_DIVIDENDS: "Anti-snipe launch tax → StockBooster dividends (90%)",
  LAUNCH_TAX_DEV: "Anti-snipe launch tax → launch dev (10%)",
  SAFE_TAX: "Safe Launch / Stonklauncher snipe tax (time-decay tax on window trades)",
  SAFE_TAX_PROTOCOL: "Safe Launch tax → protocol accrual (16.5%)",
  SAFE_TAX_CREATOR: "Safe Launch tax → launch creator (16.5%)",
  SAFE_TAX_BOOSTER: "Safe Launch tax → StockBooster + Clock In Card referrers (17%)",
  SAFE_TAX_LP: "Safe Launch tax → permanently locked LP reserve / ICO Bonus (50%)",
  CURVE_FEES: "Stonk Launcher bonding-curve trade fees (1%)",
  CURVE_PROTOCOL: "Bonding-curve fees → protocol (33.34%)",
  CURVE_CREATOR: "Bonding-curve fees → creator (33.33%)",
  CURVE_STONK: "Bonding-curve fees → StonkBrokers Directed Clock In / pot (33.33%)",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [launchBuyLogs, safeBuyLogsByPad, safeSellLogsByPad] = await Promise.all([
    options.getLogs({ targets: ANTI_SNIPE_LAUNCHES, eventAbi: WALL_BOUGHT }),
    options.getLogs({ targets: SAFE_PAD_TARGETS, eventAbi: SAFE_BUY, flatten: false }),
    options.getLogs({ targets: SAFE_PAD_TARGETS, eventAbi: SAFE_SELL, flatten: false }),
  ]);

  // Bonding-curve launcher pools (closed factory — residual trading).
  const launched = await options.getLogs({
    target: LAUNCHER_FACTORY,
    fromBlock: LAUNCHER_FACTORY_START,
    eventAbi: TOKEN_LAUNCHED,
    cacheInCloud: true,
  });
  const curvePools = [
    ...new Set(
      launched.map((l: any) => String(l.pool || "").toLowerCase()).filter((a: string) => /^0x[0-9a-f]{40}$/.test(a)),
    ),
  ];
  const curveTradeLogs = curvePools.length > 0 ? await options.getLogs({ targets: curvePools, eventAbi: CURVE_TRADE }) : [];

  // ── Anti-snipe fair-launch tax (one-off launches, e.g. $WALL) ────────────
  // Time-decay snipe tax on launch-curve buys (99% at the bell, −1%/minute).
  // Pushed live per trade: 90% StockBooster (Clock In dividends to activated
  // brokers) / 10% launch dev. The net raise bonds into permanently locked LP
  // at graduation, so the tax is the only fee leg that leaves the curve.
  for (const log of launchBuyLogs) {
    const ethIn = BigInt(log.ethIn);
    const tax = BigInt(log.taxPaid);
    if (ethIn > 0n) dailyVolume.addGasToken(ethIn);
    if (tax <= 0n) continue;
    const toBooster = (tax * LAUNCH_BOOSTER_BPS) / 10_000n;
    dailyFees.addGasToken(tax, LABELS.LAUNCH_TAX);
    dailySupplySideRevenue.addGasToken(toBooster, LABELS.LAUNCH_TAX_DIVIDENDS);
    // The 10% dev leg pays the launching team, not the protocol — counted in
    // fees, excluded from revenue/protocolRevenue.
    dailySupplySideRevenue.addGasToken(tax - toBooster, LABELS.LAUNCH_TAX_DEV);
  }

  // ── Safe Launch / Stonklauncher pads (V1 ETH + quoted + V2 + r2) ────────
  // Window buys AND sells pay the same decaying tax.
  // Volume (mirrors HoodMint ethGross discipline):
  //   buy  → quoteIn / ethIn (tax-inclusive gross)
  //   sell → quoteOut/ethOut + taxPaid (gross quote leaving the curve)
  // Field names differ by generation (ethIn on V1, quoteIn on V2) but are
  // positional twins — read both. Process buys/sells separately so a decoder
  // that zeroes missing fields cannot collapse sell volume to 0 via ethIn=0.
  // Fee split per launch snapshot: 16.5% creator / 16.5% protocol / 50%
  // locked-LP (or ICO Bonus on degen) / 17% Clock In Card. Protocol leg =
  // revenue; LP/ICO = supply-side. LpFeeBonded re-settles already-counted tax.
  const addSafeTax = (quote: string | null, tax: bigint) => {
    const toCreator = (tax * SAFE_CREATOR_BPS) / 10_000n;
    const toProtocol = (tax * SAFE_PROTOCOL_BPS) / 10_000n;
    const toLp = (tax * SAFE_LP_BPS) / 10_000n;
    const toBoosterAndRef = tax - toCreator - toProtocol - toLp;
    addQuote(dailyFees, quote, tax, LABELS.SAFE_TAX);
    addQuote(dailyRevenue, quote, toProtocol, LABELS.SAFE_TAX_PROTOCOL);
    addQuote(dailyProtocolRevenue, quote, toProtocol, LABELS.SAFE_TAX_PROTOCOL);
    addQuote(dailySupplySideRevenue, quote, toCreator, LABELS.SAFE_TAX_CREATOR);
    addQuote(dailySupplySideRevenue, quote, toBoosterAndRef, LABELS.SAFE_TAX_BOOSTER);
    addQuote(dailySupplySideRevenue, quote, toLp, LABELS.SAFE_TAX_LP);
  };
  for (let i = 0; i < SAFE_LAUNCH_PADS.length; i++) {
    const quote = SAFE_LAUNCH_PADS[i].quote;
    for (const log of safeBuyLogsByPad[i] ?? []) {
      const tax = BigInt(log.taxPaid ?? 0);
      const gross = BigInt(log.ethIn ?? log.quoteIn ?? 0);
      if (gross > 0n) addQuote(dailyVolume, quote, gross);
      if (tax > 0n) addSafeTax(quote, tax);
    }
    for (const log of safeSellLogsByPad[i] ?? []) {
      const tax = BigInt(log.taxPaid ?? 0);
      const netOut = BigInt(log.ethOut ?? log.quoteOut ?? 0);
      const gross = netOut + tax;
      if (gross > 0n) addQuote(dailyVolume, quote, gross);
      if (tax > 0n) addSafeTax(quote, tax);
    }
  }

  // ── Bonding-curve Stonk Launcher (closed factory, residual trades) ───────
  // Trade.feeAmount is the full 1% fee; waterfall 3333/3334/3333
  // creator / protocol / StonkBrokers. Quote on production launches is ETH.
  for (const log of curveTradeLogs) {
    const quoteAmt = BigInt(log.quoteAmount);
    const fee = BigInt(log.feeAmount);
    if (quoteAmt > 0n) dailyVolume.addGasToken(quoteAmt);
    if (fee <= 0n) continue;
    const toCreator = (fee * LAUNCHER_CREATOR_BPS) / 10_000n;
    const toStonk = (fee * LAUNCHER_STONK_BPS) / 10_000n;
    const toProtocol = fee - toCreator - toStonk;
    dailyFees.addGasToken(fee, LABELS.CURVE_FEES);
    dailyRevenue.addGasToken(toProtocol, LABELS.CURVE_PROTOCOL);
    dailyProtocolRevenue.addGasToken(toProtocol, LABELS.CURVE_PROTOCOL);
    dailySupplySideRevenue.addGasToken(toCreator, LABELS.CURVE_CREATOR);
    dailySupplySideRevenue.addGasToken(toStonk, LABELS.CURVE_STONK);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-12",
  methodology: {
    Volume:
      "Safe Launch / Stonklauncher window buys AND sells on every pad generation (V1 ETH, V1 quoted, V2, r2 — buy = tax-inclusive quoteIn/ethIn, sell = quoteOut/ethOut + taxPaid, quote-token denominated on quoted/WETH lanes) + anti-snipe WallBought.ethIn + StonkCurvePool Trade.quoteAmount on the bonding-curve launcher.",
    Fees:
      "Safe Launch / Stonklauncher snipe tax on window buys and sells across all pad generations (16.5% creator / 16.5% protocol / 50% locked-LP or ICO Bonus / 17% StockBooster + Clock In Card referrers); the anti-snipe fair-launch snipe tax (time-decay tax on launch-curve buys, 90% StockBooster / 10% launch dev); and StonkCurvePool 1% trade fees (33/33/33 waterfall).",
    Revenue: "The 16.5% protocol leg of the Safe Launch / Stonklauncher snipe tax and 33.34% of bonding-curve trade fees.",
    ProtocolRevenue: "16.5% of the Safe Launch / Stonklauncher snipe tax → protocol accrual; 33.34% of bonding-curve trade fees → protocol.",
    SupplySideRevenue:
      "Safe Launch tax legs to the launch creator (16.5%), StockBooster + Clock In Card referrers (17%), and the permanently locked LP reserve / ICO Bonus (50%); 90% of the anti-snipe launch tax → StockBooster dividends and 10% → launch dev; bonding-curve creator (33.33%) + StonkBrokers Directed Clock In / pot (33.33%).",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.LAUNCH_TAX]:
        "Time-decay snipe tax on anti-snipe fair-launch curve buys (99% at launch, falling 1%/minute over a 99-minute window; WallBought.taxPaid). Split 90% StockBooster / 10% launch dev, pushed live per trade.",
      [LABELS.SAFE_TAX]:
        "Time-decay snipe tax on Safe Launch / Stonklauncher window buys AND sells (SafeBuy/SafeSell taxPaid) across the V1 ETH pad, V1 quoted lanes, V2 lanes, and r2 pads. Split 16.5% launch creator / 16.5% protocol / 50% locked-LP reserve or ICO Bonus / 17% StockBooster + Clock In Card referrers, snapshotted per launch. Quoted-lane amounts are in the quote token.",
      [LABELS.CURVE_FEES]:
        "1% trade fee on StonkCurvePool (bonding-curve Stonk Launcher factory), waterfall 33.33% creator / 33.34% protocol / 33.33% StonkBrokers.",
    },
    Revenue: {
      [LABELS.SAFE_TAX_PROTOCOL]: "16.5% protocol leg of the Safe Launch / Stonklauncher snipe tax.",
      [LABELS.CURVE_PROTOCOL]: "33.34% of bonding-curve trade fees → protocol.",
    },
    ProtocolRevenue: {
      [LABELS.SAFE_TAX_PROTOCOL]: "16.5% protocol leg of the Safe Launch / Stonklauncher snipe tax.",
      [LABELS.CURVE_PROTOCOL]: "33.34% of bonding-curve trade fees → protocol.",
    },
    SupplySideRevenue: {
      [LABELS.LAUNCH_TAX_DIVIDENDS]:
        "90% of the anti-snipe launch snipe tax → StockBooster → Clock In stock dividends to activated brokers.",
      [LABELS.LAUNCH_TAX_DEV]: "10% of the anti-snipe launch snipe tax → launch dev.",
      [LABELS.SAFE_TAX_CREATOR]: "16.5% of the Safe Launch / Stonklauncher snipe tax → launch creator.",
      [LABELS.SAFE_TAX_BOOSTER]:
        "17% of the Safe Launch / Stonklauncher snipe tax punched through the Clock In Card: ~0.5% of tax to the referrer, the rest to StockBooster Clock In dividends.",
      [LABELS.SAFE_TAX_LP]:
        "50% of the Safe Launch / Stonklauncher snipe tax escrowed as the launch's LP reserve (joins the raise at bond into permanently locked liquidity) or streamed to the ICO Bonus kickstarter on degen modes.",
      [LABELS.CURVE_CREATOR]: "33.33% of bonding-curve trade fees → launch creator.",
      [LABELS.CURVE_STONK]: "33.33% of bonding-curve trade fees → StonkBrokers Directed Clock In engine / jackpot pot.",
    },
  },
};

export default adapter;
