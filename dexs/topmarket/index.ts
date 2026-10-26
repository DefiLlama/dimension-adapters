import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json';
import { httpGet } from "../../utils/fetchURL";
import { id, zeroPadValue } from "ethers";
import { ChainApi } from "@defillama/sdk";

const USDC = ADDRESSES.base.USDC;
// Base Mainnet network identifier: https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId
const BASE_CHAIN_ID = 8453;
// Native Base USDC decimals(), verified on-chain:
// https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913#readProxyContract
const USDC_DECIMALS = 6;
const MARKET = "0xf20658ec88403e9a26d77fb95e91c1248d9818ea";
const BOX_FACTORY = "0x0e218eddfed2b6e482d2989d05c6db0ee41db2f2"; // creates BlindBox boxes
const TOKEN_BOX_FACTORY = "0x8f142f5bbc4061df7c84b4990ce9081e4acd4abf"; // creates TokenBlindBox boxes
const FACTORY_START_BLOCK = 50636771; // BOX_FACTORY deployment
// https://basescan.org/tx/0xe68d82a4b1c3390420fb5cb312faaa27c5e1c775a2550dec64525a487a9bb51a
const TOKEN_FACTORY_START_BLOCK = 52098220;
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
  FeeRecipientUpdated: "event FeeRecipientUpdated(address indexed newRecipient)",
  JackpotSet: "event JackpotSet(address indexed jackpot)",
  MarketFeeRecipientUpdated: "event FeeRecipientUpdated(address feeRecipient)",
  PayoutDeferred: "event PayoutDeferred(address indexed account, uint256 amount)",
  Withdrawn: "event Withdrawn(address indexed account, uint256 amount)",
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
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
// Adapter-local HTTP budget, not a protocol parameter: allow 10 seconds per page
// and propagate timeouts so missing commissions never become zero revenue costs.
const REFERRAL_TIMEOUT_MS = 10_000;

async function getReferrals(options: FetchOptions) {
  // The runner's fromTimestamp is the previous window's final second.
  // Use [from, to), not overlapping 3,601-second / 86,401-second API windows.
  const from = options.fromTimestamp + 1, to = options.endTimestamp;
  const rows: any[] = [];
  const seen = new Set<string>();
  let cursor = "";
  while (true) {
    const page = await httpGet(`${REFERRAL_API}?from=${from}&to=${to}${cursor}`, { timeout: REFERRAL_TIMEOUT_MS });
    if (page?.schema !== "topmarket-referrals-v1" || page.chain_id !== BASE_CHAIN_ID || page.recognition !== "settled_at" ||
      page.from_timestamp !== from || page.to_timestamp !== to || page.coverage?.complete !== true ||
      page.coverage.revision !== "settled-v1" || !(page.coverage.from_timestamp <= from) ||
      !(page.coverage.through_timestamp >= to) || !Array.isArray(page.entries))
      throw new Error("TopMarket: referral feed does not completely cover the requested window");
    for (const row of page.entries) {
      if (!/^r_[0-9a-f]{32}$/.test(row.event_id) || seen.has(row.event_id) ||
        !Number.isSafeInteger(row.settled_at) || row.settled_at < from || row.settled_at >= to ||
        row.chain_id !== BASE_CHAIN_ID || row.entry_type !== "credit" || row.token?.toLowerCase() !== USDC.toLowerCase() ||
        row.decimals !== USDC_DECIMALS || !/^[1-9][0-9]*$/.test(row.amount_raw) ||
        !["pack_purchase", "marketplace_trade", "auction_trade"].includes(row.source_type))
        throw new Error("TopMarket: invalid or duplicate referral settlement");
      const previous = rows.at(-1);
      if (previous && (row.settled_at < previous.settled_at ||
        (row.settled_at === previous.settled_at && row.event_id <= previous.event_id)))
        throw new Error("TopMarket: referral settlements are not ordered");
      seen.add(row.event_id);
      rows.push(row);
    }
    if (page.next_cursor === null) return rows;
    const last = page.entries.at(-1);
    if (!last || page.next_cursor?.settled_at !== last.settled_at || page.next_cursor?.event_id !== last.event_id)
      throw new Error("TopMarket: invalid referral pagination cursor");
    cursor = `&after_at=${last.settled_at}&after_id=${last.event_id}`;
  }
}

const position = (log: any) => {
  const blockNumber = Number(log.blockNumber), logIndex = Number(log.logIndex ?? log.index);
  if (log.blockNumber == null || (log.logIndex ?? log.index) == null ||
    !Number.isSafeInteger(blockNumber) || blockNumber < 0 || !Number.isSafeInteger(logIndex) || logIndex < 0)
    throw new Error("TopMarket: event is missing its on-chain position");
  return { blockNumber, logIndex };
};
const byPosition = (a: any, b: any) => {
  const x = position(a), y = position(b);
  return x.blockNumber - y.blockNumber || x.logIndex - y.logIndex;
};

// Unchanged contracts can use the closing snapshot. For a changed setting, read
// immediately before its FIRST change and replay logs, including same-block changes.
// These calls scale with configuration changes, not the number of draws.
async function addressAt(options: FetchOptions, targets: string[], abi: string, eventAbi: string,
  field: string, created: Record<string, number> = {}) {
  // SDK address: shorthand is cached across blocks by default. These settings
  // are mutable: a pre-Jackpot hour must not poison subsequent hourly runs.
  const closing = await options.api.multiCall({ abi, calls: targets, skipCache: true });
  const initial = Object.fromEntries(targets.map((target, i) => [target, closing[i].toLowerCase() as string | undefined]));
  const changes = (await options.getLogs({ targets, eventAbi, onlyArgs: false })).sort(byPosition);
  const groups = new Map<number, string[]>();
  for (const target of targets) {
    const first = changes.find(log => log.address.toLowerCase() === target);
    if (!first) continue;
    initial[target] = undefined;
    const block = position(first).blockNumber - 1;
    // A box can be created and configured in the same block. The first update
    // establishes its value; do not invent the earlier initialization argument.
    if (block < (created[target] ?? 0)) continue;
    groups.set(block, [...(groups.get(block) ?? []), target]);
  }
  for (const [block, calls] of groups) {
    // ChainApi.multiCall pins its instance block and ignores a per-call override.
    const historicalApi = new ChainApi({ chain: options.chain, block });
    const values = await historicalApi.multiCall({ abi, calls, skipCache: true });
    calls.forEach((target, i) => { initial[target] = values[i].toLowerCase(); });
  }
  return (target: string, log: any) => {
    let value = initial[target];
    for (const change of changes) {
      if (byPosition(change, log) >= 0) break;
      if (change.address.toLowerCase() === target) value = change.args[field].toLowerCase();
    }
    if (value === undefined) throw new Error(`TopMarket: cannot resolve ${abi} before first update for ${target}`);
    return value;
  };
}

const fetch = async (options: FetchOptions) => {
  // Required accounting input: a missing feed must fail the window, never turn
  // the missing commission into zero and persist overstated protocol revenue.
  const referrals = await getReferrals(options);
  const fromBlock = (await options.getFromBlock()) + 1;
  const sourceGetLogs = options.getLogs;
  options = { ...options, getFromBlock: async () => fromBlock,
    getLogs: params => sourceGetLogs({ fromBlock, ...params }) };
  const { api, createBalances, getLogs } = options;
  const created: Record<string, number> = {};
  const toBlock = await options.getToBlock();
  const getBoxes = async (factory: string, deployedAt: number): Promise<string[]> => {
    if (toBlock < deployedAt) return [];
    // Both factories retain every created box in an append-only registry.
    // https://basescan.org/address/0x5d8ca6dd45a029e0c45f0e82a5aba9ac379d88cf#code
    // https://basescan.org/address/0xb770dc0c6d46b76a8c7c3db0cf2d101a82c7a7d1#code
    // Read it at this window's closing block, not latest; daily runs must not
    // require deployment-era logs from public RPCs with pruned log history.
    const boxes: string[] = await api.fetchList({ target: factory,
      lengthAbi: "uint256:boxCount", itemAbi: "function boxAt(uint256) view returns (address)" });
    // Only creations inside this window can coincide with a setting change
    // replayed by addressAt; older boxes need no creation-history scan.
    for (const log of await getLogs({ target: factory, eventAbi: EVENTS.BoxCreated, onlyArgs: false }))
      created[log.args.box.toLowerCase()] = position(log).blockNumber;
    return boxes.map(box => box.toLowerCase());
  };
  const standardBoxes = new Set(await getBoxes(BOX_FACTORY, FACTORY_START_BLOCK));
  const boxes = [...standardBoxes, ...await getBoxes(TOKEN_BOX_FACTORY, TOKEN_FACTORY_START_BLOCK)];

  const tokens = await api.multiCall({ abi: "address:settlementToken", calls: boxes });
  const feeRecipientAt = await addressAt(options, boxes, "address:feeRecipient", EVENTS.FeeRecipientUpdated, "newRecipient", created);
  const jackpotAt = await addressAt(options, boxes, "address:jackpot", EVENTS.JackpotSet, "jackpot", created);
  const boxInfo: Record<string, { token: string }> = {};
  boxes.forEach((box, i) => {
    boxInfo[box] = { token: tokens[i] };
  });
  const boxLogs = async (eventAbi: string) =>
    (await getLogs({ targets: boxes, eventAbi, onlyArgs: false })).map((l: any) => ({ ...boxInfo[l.address.toLowerCase()], log: l }));

  const dailyVolume = createBalances();
  const packSales = createBalances();
  const buybacks = createBalances();
  const stakerPayouts = createBalances();
  const jackpot = createBalances();

  const addDraw = (token: string, gross: bigint, fee: bigint, log: any) => {
    dailyVolume.add(token, gross);
    packSales.add(token, gross);
    if (fee === 0n) return;
    const box = log.address.toLowerCase(), recipient = feeRecipientAt(box, log), pool = jackpotAt(box, log);
    if (pool !== ZERO && recipient === pool) jackpot.add(token, fee);
  };
  for (const { token, log } of await boxLogs(EVENTS.DrawRequested))
    addDraw(token, BigInt(log.args.paid) + BigInt(log.args.fee), BigInt(log.args.fee), log);
  for (const { token, log } of await boxLogs(EVENTS.TokenDrawRequested))
    addDraw(token, BigInt(log.args.paid), BigInt(log.args.fee), log);

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
  // TokenStakingPool pays immediately OR creates a PayoutDeferred credit.
  // A later Withdrawn pays an existing credit, not new supplier income.
  // https://basescan.org/address/0x28b6d82ce27ca6be2c343c593eec44075ebc797d#code
  for (const log of await getLogs({ target: TOKEN_POOL, eventAbi: EVENTS.PayoutDeferred }))
    if (!PLATFORM_STAKERS.has(log.account.toLowerCase())) stakerPayouts.add(USDC, log.amount);
  for (const log of await getLogs({ target: TOKEN_POOL, eventAbi: EVENTS.Withdrawn }))
    if (!PLATFORM_STAKERS.has(log.account.toLowerCase())) stakerPayouts.subtractToken(USDC, log.amount);

  const marketRecipientAt = await addressAt(options, [MARKET], "address:feeRecipient", EVENTS.MarketFeeRecipientUpdated, "feeRecipient");
  const marketFees = createBalances();
  // Transfer and fee-recipient update order matters, even within one block.
  const marketTransfers = await getLogs({ target: USDC, eventAbi: EVENTS.Transfer, onlyArgs: false,
    topics: [id("Transfer(address,address,uint256)"), zeroPadValue(MARKET, 32)] });
  for (const log of marketTransfers)
    if (log.args.to.toLowerCase() === marketRecipientAt(MARKET, log)) marketFees.add(USDC, log.args.value);

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
  SupplySideRevenue: "Card prices and profit shares paid or credited to third-party stakers whose cards were won, referral commissions settled to referrers, and draw fees routed to the Jackpot prize pool since October 2026.",
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
    [LABELS.STAKER_PAYOUTS]: "Card price (keep) or profit share (recycle) paid or credited to third-party stakers at settlement; later withdrawals of existing credits and payouts to the platform Safe and treasury are excluded.",
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
