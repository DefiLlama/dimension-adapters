import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json';
import { httpGet } from "../../utils/fetchURL";

const USDC = ADDRESSES.base.USDC;
const MARKET = "0xf20658ec88403e9a26d77fb95e91c1248d9818ea";
const BOX_FACTORY = "0x0e218eddfed2b6e482d2989d05c6db0ee41db2f2"; // creates BlindBox boxes
const TOKEN_BOX_FACTORY = "0x8f142f5bbc4061df7c84b4990ce9081e4acd4abf"; // creates TokenBlindBox boxes
const FACTORY_START_BLOCK = 50636771; // BOX_FACTORY deployment, the TOKEN_BOX_FACTORY came later
const TOKEN_POOL = "0x28b6d82ce27ca6be2c343c593eec44075ebc797d"; // TokenStakingPool, pays TokenBlindBox stakers

const PLATFORM_STAKERS = new Set([
  "0x394d3f699e0082fe9c4970f0e3c2de248ea21eed",
  "0x0f8dbbd0838eecf6b109c0947da4141ded0fcbab",
]);
const ZERO = ADDRESSES.null;

const EVENTS = {
  BoxCreated: "event BoxCreated(address indexed box, address indexed boxOwner)",
  // BlindBox `paid` excludes the draw fee, TokenBlindBox `paid` includes it.
  DrawRequested: "event DrawRequested(uint256 indexed requestId, address indexed player, uint256 paid, uint256 fee)",
  TokenDrawRequested: "event DrawRequested(uint256 indexed requestId, address indexed source, address indexed player, uint256 paid, uint256 fee)",
  DrawRefunded: "event DrawRefunded(uint256 indexed requestId, address indexed player, uint256 amount, uint8 reason)",
  RequestRescued: "event RequestRescued(uint256 indexed requestId, address indexed player, uint256 amount)",
  WinKept: "event WinKept(uint256 indexed winId, address indexed winner, uint256 stakerPayout)",
  WinRecycled: "event WinRecycled(uint256 indexed winId, address indexed winner, uint256 recyclePrice, address staker, uint256 stakerShare)",
  TokenWinRecycled: "event WinRecycled(uint256 indexed winId, address indexed winner, uint256 recyclePrice, uint256 stakerShare)",
};
// BlindBox keeps the win record (including its staker) after settlement.
const WINS_ABI = "function wins(uint256) view returns (address winner, address collection, uint256 tokenId, uint256 price, address staker, uint64 deadline, bool settled, bool paramsSnapshotted, uint16 snapBuybackDiscountBps, uint16 snapProfitShareBps)";

const LABELS = {
  PACK_SALES: "Gacha Pack Sales",
  BUYBACKS: "Card Buybacks",
  MARKET_FEES: "Marketplace Fees",
  STAKER_PAYOUTS: "Card Payouts To Stakers",
  JACKPOT: "Jackpot Contributions",
  PACK_REVENUE: "Gacha Pack Sales To Protocol",
  MARKET_REVENUE: "Marketplace Fees To Protocol",
  REFERRALS: "Referral Commissions",
};

// Referral commissions are settled off-chain; TopMarket publishes each settled credit with the Base tx/log
// of the purchase it came from. The feed serves at most 24h per request and pages by cursor.
const REFERRAL_API = "https://api.top.market/api/defillama/referrals";

async function getReferrals(options: FetchOptions) {
  const from = options.startTimestamp, to = options.endTimestamp;
  const rows: any[] = [];
  let cursor = "";
  while (true) {
    const page = await httpGet(`${REFERRAL_API}?from=${from}&to=${to}${cursor}`);
    if (!page?.coverage?.complete || page.coverage.through_timestamp < to) throw new Error("feed does not cover the window yet");
    rows.push(...page.entries);
    if (!page.next_cursor) return rows;
    cursor = `&after_at=${page.next_cursor.settled_at}&after_id=${page.next_cursor.event_id}`;
  }
}

const fetch = async (options: FetchOptions) => {
  const { api, createBalances, getLogs } = options;
  const getBoxes = async (factory: string) =>
    (await getLogs({ target: factory, eventAbi: EVENTS.BoxCreated, fromBlock: FACTORY_START_BLOCK, cacheInCloud: true }))
      .map((l: any) => l.box.toLowerCase());
  const standardBoxes = new Set(await getBoxes(BOX_FACTORY));
  const boxes = [...standardBoxes, ...await getBoxes(TOKEN_BOX_FACTORY)];

  const tokens = await api.multiCall({ abi: "address:settlementToken", calls: boxes });
  const feeRecipients = await api.multiCall({ abi: "address:feeRecipient", calls: boxes });
  const jackpots = await api.multiCall({ abi: "address:jackpot", calls: boxes });
  const boxInfo: Record<string, { token: string; feeToJackpot: boolean }> = {};
  boxes.forEach((box, i) => {
    boxInfo[box] = { token: tokens[i], feeToJackpot: jackpots[i] !== ZERO && feeRecipients[i].toLowerCase() === jackpots[i].toLowerCase() };
  });
  const boxLogs = async (eventAbi: string) =>
    (await getLogs({ targets: boxes, eventAbi, onlyArgs: false })).map((l: any) => ({ ...boxInfo[l.address.toLowerCase()], log: l }));

  const dailyVolume = createBalances();
  const packSales = createBalances();
  const buybacks = createBalances();
  const stakerPayouts = createBalances();
  const jackpot = createBalances();

  const addDraw = (token: string, gross: bigint, fee: bigint, feeToJackpot: boolean) => {
    dailyVolume.add(token, gross);
    packSales.add(token, gross);
    if (feeToJackpot) jackpot.add(token, fee);
  };
  for (const { token, feeToJackpot, log } of await boxLogs(EVENTS.DrawRequested))
    addDraw(token, BigInt(log.args.paid) + BigInt(log.args.fee), BigInt(log.args.fee), feeToJackpot);
  for (const { token, feeToJackpot, log } of await boxLogs(EVENTS.TokenDrawRequested))
    addDraw(token, BigInt(log.args.paid), BigInt(log.args.fee), feeToJackpot);

  for (const { token, log } of [...await boxLogs(EVENTS.DrawRefunded), ...await boxLogs(EVENTS.RequestRescued)])
    packSales.subtractToken(token, log.args.amount);

  for (const { token, log } of await boxLogs(EVENTS.WinRecycled)) {
    buybacks.add(token, log.args.recyclePrice);
    if (!PLATFORM_STAKERS.has(log.args.staker.toLowerCase())) stakerPayouts.add(token, log.args.stakerShare);
  }
  for (const { token, log } of await boxLogs(EVENTS.TokenWinRecycled))
    buybacks.add(token, log.args.recyclePrice);

  const kept = (await boxLogs(EVENTS.WinKept)).filter(({ log }) => standardBoxes.has(log.address.toLowerCase()));
  const wins = await api.multiCall({ abi: WINS_ABI, calls: kept.map(({ log }) => ({ target: log.address, params: [log.args.winId] })) });
  kept.forEach(({ token, log }, i) => {
    if (!PLATFORM_STAKERS.has(wins[i].staker.toLowerCase())) stakerPayouts.add(token, log.args.stakerPayout);
  });

  stakerPayouts.addBalances(await addTokensReceived({
    options, tokens: [USDC], fromAddressFilter: TOKEN_POOL, skipIndexer: true, logFilter: (t: any) => !PLATFORM_STAKERS.has(t.to),
  }));

  const marketFeeRecipient = await api.call({ target: MARKET, abi: "address:feeRecipient" });
  const marketFees = await addTokensReceived({ options, tokens: [USDC], target: marketFeeRecipient, fromAddressFilter: MARKET });

  // Optional leg: if the referral feed is down, publish the on-chain metrics and leave referrals out for this window.
  const referrals = await getReferrals(options).catch((e) => {
    console.error(`TopMarket: referral commissions omitted, feed unavailable: ${e.message}`);
    return [];
  });

  const dailyFees = createBalances();
  dailyFees.addBalances(packSales, LABELS.PACK_SALES);
  dailyFees.subtract(buybacks, LABELS.BUYBACKS);
  dailyFees.addBalances(marketFees, LABELS.MARKET_FEES);

  const dailySupplySideRevenue = createBalances();
  dailySupplySideRevenue.addBalances(stakerPayouts, LABELS.STAKER_PAYOUTS);
  dailySupplySideRevenue.addBalances(jackpot, LABELS.JACKPOT);

  const dailyRevenue = createBalances();
  dailyRevenue.addBalances(packSales, LABELS.PACK_REVENUE);
  dailyRevenue.subtract(stakerPayouts, LABELS.PACK_REVENUE);
  dailyRevenue.subtract(jackpot, LABELS.PACK_REVENUE);
  dailyRevenue.subtract(buybacks, LABELS.BUYBACKS);
  dailyRevenue.addBalances(marketFees, LABELS.MARKET_REVENUE);

  for (const r of referrals) {
    dailySupplySideRevenue.add(r.token, r.amount_raw, LABELS.REFERRALS);
    dailyRevenue.subtractToken(r.token, r.amount_raw, r.source_type === "pack_purchase" ? LABELS.PACK_REVENUE : LABELS.MARKET_REVENUE);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Volume: "Gross USDC players pay to open card packs, including draws that are later refunded.",
  Fees: "USDC players pay to open card packs, net of refunds and instant buybacks of won cards, plus marketplace fees on card trades.",
  Revenue: "Pack sales net of refunds and buybacks, minus payouts to third-party card stakers, referral commissions and draw fees sent to the Jackpot, plus marketplace fees. Payouts for cards staked by the platform's own wallets stay in revenue.",
  ProtocolRevenue: "Pack sales net of refunds and buybacks, minus payouts to third-party card stakers, referral commissions and draw fees sent to the Jackpot, plus marketplace fees, all kept by the TopMarket treasury.",
  SupplySideRevenue: "Card prices and profit shares paid to third-party stakers whose cards were won, referral commissions paid to referrers, and draw fees routed to the Jackpot prize pool since October 2026.",
};

const revenueBreakdown = {
  [LABELS.PACK_REVENUE]: "Pack sales net of refunds, minus payouts to third-party card stakers, pack referral commissions and Jackpot contributions.",
  [LABELS.BUYBACKS]: "Instant buybacks paid to winners who sell their card back; subtracted.",
  [LABELS.MARKET_REVENUE]: "Marketplace fees received by the treasury, minus marketplace referral commissions.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.PACK_SALES]: "USDC paid for pack draws including the draw fee, minus refunded draws.",
    [LABELS.BUYBACKS]: "Instant buybacks paid to winners who sell their card back instead of keeping it; subtracted.",
    [LABELS.MARKET_FEES]: "Platform fee the Marketplace sends to its fee recipient on each card sale, accepted offer and settled auction.",
  },
  SupplySideRevenue: {
    [LABELS.STAKER_PAYOUTS]: "Card price (keep) or profit share (recycle) paid to third-party stakers whose card was won; payouts to the platform Safe and treasury are excluded.",
    [LABELS.JACKPOT]: "Draw fees routed to the Jackpot prize pool, which pays them back to players.",
    [LABELS.REFERRALS]: "Referral commissions TopMarket settles to referrers off-chain, taken from its public settlement feed when they settle.",
  },
  Revenue: revenueBreakdown,
  ProtocolRevenue: revenueBreakdown,
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-09-08",
  allowNegativeValue: true, // a buyback can land in a later hour than its draw, so an hour's net pack sales can be negative
  methodology,
  breakdownMethodology,
};

export default adapter;
