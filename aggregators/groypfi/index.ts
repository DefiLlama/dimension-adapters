import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { normAddr, pageToncenterMessages, pageToncenterTxs, toBigInt, toncenterGet } from "../../helpers/ton";

/**
 * GroypFi — multi-product trading platform on TON
 *
 * Products (all charge a platform fee that settles into the house wallets below):
 *   - Swap / DEX aggregator (DeDust, STON.fi, Tonco, Bidask, Omniston incl. xStocks)
 *   - Trading Terminal and Pulse
 *   - Cross-Chain Swap
 *   - NFT aggregator and Gifted marketplace
 *   - topblast.lol launchpad trading
 *   - Gbot Telegram trading bot (@groypfi_bot)
 *   - OTC Desk (fixed-price escrow sell orders, 0.5% buyer + 0.5% seller fee per fill)
 *
 * Fees: every inflow to the four house wallets is protocol revenue (owner's rule) — labelled swap /
 * Gifted / walletless fees, OTC Desk fill fees, DeDust Uranus partner-fee and graduated-pool creator/LP fee
 * claims, and payments from partner protocols integrated on GroypFi. Excluded, because they are not new money:
 *   - transfers between the house wallets (incl. the "GroypFi Fee" the house pays itself on buybacks)
 *   - proceeds, refunds and gas change of the house wallets' own trades and buybacks
 *   - gas excesses (op 0xd53276db) returned to the house wallets
 *
 * Holders revenue: $GROYP buybacks since the first one (2025-12-11) — what the house wallets actually spend
 * swapping into $GROYP (toncenter jetton_swap actions with asset_out = GROYP), observed on-chain per window and
 * paid for out of house-wallet revenue; the bought $GROYP is burned. Paid in GRAM/TON on DeDust, DeDust v2 and
 * TONCO (asset_in = null) or on STON.fi v1, where toncenter reports the wrapped pTON master as asset_in (most of
 * the early buybacks went this way), plus a few paid in USD₮.
 *
 * Volume: reverse-calculated from fees at the 1% standard rate. OTC fills pay exactly 1% (so their volume is the
 * fill price within 200 nanoGRAM); discounted trades pay less (0.8% / 0.5% for $GROYP holders, 0.1% on TopBlast
 * tokens), so trading volume is an estimate.
 *
 * Perps: GroypFi, Gbot and lockin share one Hyperliquid builder code, reported once under lockin.
 *
 * House wallets:
 *   UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q (groypfihouse.ton, also the $GROYP buyback wallet)
 *   UQCvlNDUcVJq55xVNV9BvCC1KUaMVUetnUkr_sSovHTLmTsj
 *   UQAuMfZUcQoiOt-S4vWJhlT2Qlewgrmi99AQ4ISEjDCAIR-i
 *   UQDz_6Hyrq2AgMIWw4S5xPH9OBMcaerRp14y94T-cRJistBx
 *
 * Website: https://groypfi.io  ·  X: https://x.com/groypfi
 */

const HOUSE_WALLETS = [
  "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594", // UQDu4AiT… (fees + buybacks)
  "0:af94d0d471526ae79c55355f41bc20b529468c5547ad9d492bfec4a8bc74cb99", // UQCvlNDU…
  "0:2e31f654710a223adf92e2f5898654f64257b082b9a2f7d010e084848c308021", // UQAuMfZU…
  "0:f3ffa1f2aead8080c216c384b9c4f1fd38131c69ead1a75e32f784fe711262b2", // UQDz_6Hy…
];
const HOUSE = new Set(HOUSE_WALLETS);

// $GROYP jetton master EQAtwo6qMNwtr0iTA9eKVZ32cuACFJ0VKd78GrBWOe83-X1P
const GROYP_MASTER = "0:2dc28eaa30dc2daf489303d78a559df672e002149d1529defc1ab05639ef37f9";

// Buybacks paid in GRAM/TON: toncenter reports native TON as asset_in = null, except on STON.fi routers that wrap
// it in pTON, where asset_in is the pTON master. pTON is 1:1 TON.
const PTON_MASTERS = new Set([
  "0:8cdc1d7640ad5ee326527fc1ad0514f468b30dc84b0173f0e155f451b4e11f7c", // pTON v1 (STON.fi v1 router)
  "0:671963027f7f85659ab55b821671688601cdcf1ee674fc7fbbb1a776a18d34a3", // pTON v2.1 (STON.fi v2 routers)
]);
// Buybacks paid in USD₮ (EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs)
const USDT_MASTER = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";

// GroypFi OTC Desk: orders are exactly the contracts an official OtcFactory sent InitOrder to. The only GRAM an
// order ever sends the house wallet is its fill fee (0.5% taker + 0.5% maker, one message per fill).
const OTC_FACTORIES = [
  "0:3cad942683064522b8ce8d8b6c5da20a5612108a077df21f4fbd0fb4caef5ca7", // OtcFactory v3
  "0:d5a966d0bcc9a4685d49dc925236e412f0af3d0bb31ce389c0a17b158f921718", // OtcFactory v2
];
const OTC_INIT_ORDER_OP = "0x4f544332";
const OTC_START = 1794684130; // first OtcFactory v2 transaction, 2026-11-14

const SWAP_FEE_COMMENTS = new Set(["GroypFi Fee", "Gbot Fee", "GroypFi Bot Fee"]);
const GIFTED_FEE_COMMENTS = new Set(["Gifted Fees", "Gifted Marketplace Fees"]);
const isWalletlessFee = (comment?: string) => comment === "walletless fee" || !!comment?.startsWith("walletless fee ");

// volume = fee / 1% (standard rate)
const VOLUME_PER_FEE = 100n;

const EXCESS_OP = "0xd53276db";

// Opcodes from https://github.com/ton-blockchain/abis/tree/master/data/dedust
const URANUS_CLAIM_PARTNER_FEE = "0x7f4bcbf4";
const URANUS_PAYOUT = "0x66c8ad72";
const CPMM_CLAIM_CREATOR_FEES = "0xbe3e3179";
const CPMM_PAYOUT_POSITION_FEES = "0x29ff1bcf";
const CPMM_PAYOUT = "0x3216ca09";

const LABELS = {
  SWAP: "Swap Fees",
  GIFTED: "Gifted Marketplace Fees",
  WALLETLESS: "Walletless Fees",
  OTC: "OTC Desk Fees",
  URANUS_PARTNER: "Uranus Partner Fees",
  POOL_CREATOR: "Graduated Pool Creator Fees",
  POOL_LP: "Graduated Pool LP Fees",
  PARTNER: "Partner Protocol Payments",
};

// Payout opcode -> opcode of the request that triggered it -> label. The same payout opcodes are also used for
// swap payouts and buy callbacks (the house wallet's own trades, not fees), so the request is read from the trace.
const TRACE_PAYOUTS: Record<string, Record<string, string>> = {
  [URANUS_PAYOUT]: { [URANUS_CLAIM_PARTNER_FEE]: LABELS.URANUS_PARTNER },
  [CPMM_PAYOUT]: { [CPMM_CLAIM_CREATOR_FEES]: LABELS.POOL_CREATOR, [CPMM_PAYOUT_POSITION_FEES]: LABELS.POOL_LP },
};

// A swap's DEX payout can land a little after the swap started, possibly in the next window.
const SWAP_TRACE_LOOKBACK = 15 * 60;

async function otcOrders(endTimestamp: number): Promise<Set<string>> {
  const orders = new Set<string>();
  if (endTimestamp <= OTC_START) return orders;
  for (const factory of OTC_FACTORIES) {
    const msgs = await pageToncenterMessages({ source: factory, opcode: OTC_INIT_ORDER_OP, startTimestamp: OTC_START, endTimestamp });
    for (const m of msgs) if (m.destination) orders.add(normAddr(m.destination));
  }
  return orders;
}

// Every jetton_swap action of `account` that started in [startTimestamp, endTimestamp).
async function houseSwaps(account: string, startTimestamp: number, endTimestamp: number): Promise<any[]> {
  const all: any[] = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const res = await toncenterGet({
      path: "actions",
      params: { account, action_type: "jetton_swap", start_utime: startTimestamp, end_utime: endTimestamp - 1, limit, offset, sort: "asc" },
    });
    if (!Array.isArray(res?.actions)) throw new Error(`Expected an actions array from toncenter for ${account}`);
    for (const a of res.actions) if (a.start_utime >= startTimestamp && a.start_utime < endTimestamp) all.push(a);
    if (res.actions.length < limit) break;
  }
  return all;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // The house wallets' own swaps (buybacks and other trades): their payouts, refunds and gas change are not fees.
  const ownSwapTraces = new Set<string>();
  let buybackNano = 0n;
  let buybackUsdt = 0n;
  for (const wallet of HOUSE_WALLETS) {
    for (const action of await houseSwaps(wallet, startTimestamp - SWAP_TRACE_LOOKBACK, endTimestamp)) {
      const d = action.details ?? {};
      if (!HOUSE.has(normAddr(d.sender))) continue;
      if (action.trace_id) ownSwapTraces.add(action.trace_id);
      if (action.start_utime < startTimestamp || action.success === false) continue;
      if (normAddr(d.asset_out) !== GROYP_MASTER) continue;
      const assetIn = d.asset_in == null ? null : normAddr(d.asset_in);
      const spent = toBigInt(d.dex_incoming_transfer?.amount);
      if (assetIn === null || PTON_MASTERS.has(assetIn)) buybackNano += spent;
      else if (assetIn === USDT_MASTER) buybackUsdt += spent;
    }
  }

  const orders = await otcOrders(endTimestamp);

  // deduped by hash and restricted to [start, end) by the helper
  const txs = await pageToncenterTxs({ account: HOUSE_WALLETS, startTimestamp, endTimestamp });
  let feeNano = 0n;
  const addFee = (value: any, label: string) => {
    const v = toBigInt(value);
    if (v <= 0n) return;
    feeNano += v;
    dailyFees.addGasToken(v, label);
    dailyRevenue.addGasToken(v, label);
    dailyProtocolRevenue.addGasToken(v, label);
  };

  const payouts: any[] = [];
  for (const tx of txs) {
    if (tx.description?.action?.success === false) continue;

    const inMsg = tx.in_msg;
    if (!inMsg || inMsg.bounced || !inMsg.source) continue;
    if (!HOUSE.has(normAddr(inMsg.destination))) continue;

    const source = normAddr(inMsg.source);
    if (HOUSE.has(source)) continue; // own-wallet transfers, incl. the self-paid fee on buybacks
    if (orders.has(source)) {
      addFee(inMsg.value, LABELS.OTC);
      continue;
    }
    if (tx.trace_id && ownSwapTraces.has(tx.trace_id)) continue; // own trades / buybacks
    if (inMsg.opcode === EXCESS_OP) continue; // gas change from the house wallets' own messages

    const comment = inMsg.message_content?.decoded?.comment;
    if (SWAP_FEE_COMMENTS.has(comment)) addFee(inMsg.value, LABELS.SWAP);
    else if (GIFTED_FEE_COMMENTS.has(comment)) addFee(inMsg.value, LABELS.GIFTED);
    else if (isWalletlessFee(comment)) addFee(inMsg.value, LABELS.WALLETLESS);
    else if (TRACE_PAYOUTS[inMsg.opcode]) {
      if (!tx.trace_id) throw new Error(`Missing trace ID for payout ${tx.hash}`);
      payouts.push(tx);
    } else addFee(inMsg.value, LABELS.PARTNER);
  }

  // Claims are batched, so one trace covers many payouts; the claim request may sit in an earlier window.
  const traceTxs = new Map<string, any[]>();
  for (const traceId of new Set<string>(payouts.map((tx) => tx.trace_id))) {
    const response = await toncenterGet({ path: "traces", params: { trace_id: traceId } });
    const trace = response.traces?.[0];
    if (!trace || trace.is_incomplete || trace.trace_info?.trace_state !== "complete")
      throw new Error(`Incomplete payout trace: ${traceId}`);
    traceTxs.set(traceId, Object.values(trace.transactions ?? {}));
  }
  for (const tx of payouts) {
    const sender = traceTxs.get(tx.trace_id)!.find((t) => t.out_msgs?.some((m: any) => m.hash === tx.in_msg.hash));
    if (!sender) throw new Error(`Missing payout sender: ${tx.hash}`);
    const label = TRACE_PAYOUTS[tx.in_msg.opcode][sender.in_msg?.opcode];
    // Payouts not triggered by a fee claim are the house wallets' own curve/pool trades.
    if (label) addFee(tx.in_msg.value, label);
  }

  dailyVolume.addGasToken(feeNano * VOLUME_PER_FEE);
  dailyHoldersRevenue.addGasToken(buybackNano, METRIC.TOKEN_BUY_BACK);
  if (buybackUsdt > 0n) dailyHoldersRevenue.add(ADDRESSES.ton.USDT, buybackUsdt, METRIC.TOKEN_BUY_BACK);

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Volume: "Trading volume across GroypFi's Swap, Terminal, Cross-Chain Swap, NFT, launchpad trading, OTC Desk and the Gbot Telegram bot, reverse-calculated from the fees at the 1% standard rate (OTC fills pay exactly 1%; discounted 0.8% / 0.5% / 0.1% trades make the rest an estimate).",
  Fees: "Every inflow to the four GroypFi house wallets: swap, Gifted marketplace, walletless and OTC Desk fill fees, DeDust Uranus partner-fee and graduated-pool creator/LP fee claims, and payments from partner protocols integrated on GroypFi. Transfers between the house wallets, the proceeds, refunds and gas change of the house wallets' own trades and $GROYP buybacks and gas excesses are excluded.",
  UserFees: "Platform fees paid by users on every trade, plus partner-protocol payments, which cannot be told apart on-chain.",
  Revenue: "100% of fees are kept by GroypFi.",
  ProtocolRevenue: "All fees settle into the GroypFi house wallets (treasury).",
  HoldersRevenue: "$GROYP buybacks since the first one on 2025-12-11: GRAM/TON (incl. STON.fi's wrapped pTON) and USD₮ the house wallets actually spend swapping into $GROYP (EQAtwo6qMNwtr0iTA9eKVZ32cuACFJ0VKd78GrBWOe83-X1P) on STON.fi, DeDust and TONCO, measured on-chain. Bought $GROYP is burned. They are paid for out of house-wallet revenue, in lumps that can land in a different period than the fees that funded them.",
};

const feeBreakdown = {
  [LABELS.SWAP]: "Fee sent to a house wallet on swaps through the GroypFi web app (Swap, Terminal, launchpad trading) and the Gbot Telegram bot.",
  [LABELS.GIFTED]: "Fees from the Gifted marketplace sent to a house wallet.",
  [LABELS.WALLETLESS]: "Fees from walletless (send-to-buy) trades sent to a house wallet.",
  [LABELS.OTC]: "GroypFi OTC Desk fill fee: 0.5% from the buyer plus 0.5% from the seller of every filled escrow order, paid by the order contract to the house wallet. Orders are only those deployed by the official OtcFactory contracts.",
  [LABELS.URANUS_PARTNER]: "GroypFi's partner share of DeDust Uranus bonding-curve trading fees, claimed by a house wallet.",
  [LABELS.POOL_CREATOR]: "Creator share of trading fees on DeDust v2 pools of graduated Uranus tokens, claimed by a house wallet.",
  [LABELS.POOL_LP]: "Trading fees earned by liquidity positions a house wallet receives when Uranus tokens graduate, claimed by a house wallet.",
  [LABELS.PARTNER]: "Every other inflow to a house wallet: payments from partner protocols integrated on GroypFi and other fees.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-12-11", // first transaction of the earliest house wallet (UQDu4AiT…) and its first $GROYP buyback
  methodology,
  breakdownMethodology: {
    Fees: feeBreakdown,
    UserFees: feeBreakdown,
    Revenue: feeBreakdown,
    ProtocolRevenue: feeBreakdown,
    HoldersRevenue: { [METRIC.TOKEN_BUY_BACK]: "GRAM/TON and USD₮ spent by the house wallets buying back $GROYP." },
  },
  pullHourly: true,
};

export default adapter;
