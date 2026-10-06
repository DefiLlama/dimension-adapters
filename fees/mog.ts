import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// mog (https://mog.xyz) - treasury-backed perps on Robinhood Chain, up to 1000x, no LPs.
// Traders face the protocol treasury: losses accrue to it (and mint MOG), profits are paid from it.
// Contracts (unverified proxies; ABI taken from the app bundle), see https://docs.mog.xyz/trading/fees
const CORE = "0x11c0c0007abed9ef5dfa3df1d726b4fd271c52ea";
const MARKETS = "0xBaF66148476F57F50f154a7f77F1AEF82Ce7F24c";

// All amounts are USDG in 1e18 wad units.
const OPEN_FEE_RELEASED = "event OpenFeeReleased(address indexed to, uint256 fee, bool refunded)";
const WIN_SETTLED = "event WinSettled(uint16 indexed mkt, address indexed owner, uint64 indexed cohortId, uint64 posId, uint256 r, uint256 face, uint256 fee)";
const BUILDER_ACCRUED = "event BuilderAccrued(address indexed builder, uint256 amount)";
const MOG_TOKEN = "0x45c94a25d951d652c2d09e9f6f7d6c0d75dd8d23";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const FILLED = "event Filled(uint16 indexed mkt, uint64 indexed posId, address indexed owner, uint8 side, uint128 m, uint128 r, uint128 fillMark, uint64 nonce)";
const FILLED_TERMS = "event FilledTerms(uint16 indexed mkt, uint64 indexed posId, uint128 downLevel, uint128 upLevel, bool near, uint16 lev, uint256 kWad)";
const CLOSED = "event Closed(uint16 indexed mkt, uint64 indexed closeId, uint64 indexed posId, uint64 nonce, uint128 sliceM, uint128 sliceR, uint128 remainderM)";
const POSITION_OF = "function positionOf(uint16 mkt, uint64 posId) view returns ((address owner, uint8 side, uint8 status, uint56 fillNonce, uint8 flags, uint16 lev, uint128 m, uint128 r, uint128 downLevel, uint128 upLevel, uint128 fillMark, uint64 hWad, uint64 dPrev, uint64 dNext, uint64 uPrev, uint64 uNext, uint64 cWad, uint128 n, uint128 mCol))";

const OPEN_FEES = "Open Fees";
const PROFIT_FEES = "Profit Fees";
const BUILDER_FEES = "Builder Fees";
const wad = (x: any) => Number(x) / 1e18;
const key = (log: any) => `${log.mkt}-${log.posId}`;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const [openFees, wins, builders, mogTransfers, fills, terms, closes] = await Promise.all([
    options.getLogs({ target: CORE, eventAbi: OPEN_FEE_RELEASED }),
    options.getLogs({ target: CORE, eventAbi: WIN_SETTLED }),
    options.getLogs({ target: CORE, eventAbi: BUILDER_ACCRUED }),
    options.getLogs({ target: MOG_TOKEN, eventAbi: TRANSFER }),
    options.getLogs({ target: MARKETS, eventAbi: FILLED }),
    options.getLogs({ target: MARKETS, eventAbi: FILLED_TERMS }),
    options.getLogs({ target: MARKETS, eventAbi: CLOSED }),
  ]);

  // flat 0.5 USDG per order, 100% to protocol operations. The fee is kept when the order fills, is
  // cancelled or expires; it is refunded only when a pause, delist or terms change voids the order.
  for (const log of openFees) {
    if (log.refunded) continue;
    dailyFees.addUSDValue(wad(log.fee), OPEN_FEES);
    dailyProtocolRevenue.addUSDValue(wad(log.fee), OPEN_FEES);
  }

  // 5% of settled profit. 70% accrues to the MOG buyback wallet and is junior to every trader
  // payout; it counts as holders revenue only when the wallet burns MOG with it (below).
  for (const log of wins) {
    const fee = wad(log.fee);
    dailyFees.addUSDValue(fee, PROFIT_FEES);
    dailyProtocolRevenue.addUSDValue(fee, PROFIT_FEES);
  }

  // A qualifying builder (the frontend that placed the order) takes a carve out of the operations share.
  for (const log of builders) {
    const carve = wad(log.amount);
    dailySupplySideRevenue.addUSDValue(carve, BUILDER_FEES);
    dailyProtocolRevenue.addUSDValue(-carve, PROFIT_FEES);
  }

  // A buyback is the buyback wallet buying MOG and burning it with MogToken.burn, which emits
  // Transfer(wallet, 0). Only those burns are holders revenue, moved out of protocol revenue.
  // Payouts to the wallet are not counted: the wallet can use them for other treasury moves.
  const burns = mogTransfers.filter((log: any) => log.to.toLowerCase() === NULL_ADDRESS);
  if (burns.length) {
    const buybackWallet = (await options.api.call({ target: CORE, abi: "address:buyback" })).toLowerCase();
    for (const log of burns) {
      if (log.from.toLowerCase() !== buybackWallet) continue;
      dailyHoldersRevenue.add(MOG_TOKEN, log.value, METRIC.TOKEN_BUY_BACK);
      dailyProtocolRevenue.add(MOG_TOKEN, -BigInt(log.value), METRIC.TOKEN_BUY_BACK);
    }
  }

  // notional opened = margin (Filled.m) x leverage (FilledTerms.lev), both emitted in the fill tx
  const levByPos: Record<string, number> = {};
  for (const log of terms) levByPos[key(log)] = Number(log.lev);
  for (const log of fills) {
    const lev = levByPos[key(log)];
    if (!lev) throw new Error(`mog: missing FilledTerms for position ${key(log)}`);
    dailyVolume.addUSDValue(wad(log.m) * lev);
  }

  // A trader close (closeId > 0; 0 is a delist sweep) trades its slice of the frozen notional.
  // A partial close cuts the notional n and the face r by the same fraction, and a margin top-up
  // changes neither, so n / r is fixed for the life of the position and Closed.sliceR x n / r is
  // the slice's notional. That holds at any later block, so a refill reproduces the same value
  // even though the public RPC keeps little historical state.
  const traderCloses = closes.filter((log: any) => Number(log.closeId) !== 0);
  if (traderCloses.length) {
    const ids = [...new Map(traderCloses.map((log: any) => [key(log), log])).values()];
    const positions = await options.api.multiCall({
      target: MARKETS,
      abi: POSITION_OF,
      calls: ids.map((log: any) => ({ params: [log.mkt, log.posId] })),
    });
    const termsByPos: Record<string, any> = {};
    ids.forEach((log: any, i: number) => { termsByPos[key(log)] = positions[i]; });
    for (const log of traderCloses) {
      const p = termsByPos[key(log)];
      if (Number(p.r) === 0) throw new Error(`mog: position ${key(log)} has no face`);
      dailyVolume.addUSDValue(wad(log.sliceR) * (Number(p.n) / Number(p.r)));
    }
  }

  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue);
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Volume: "Notional traded on mog perpetual markets: margin times leverage of every filled order, plus the notional of every trader close. Liquidations, payout-barrier exits and delist sweeps are not counted.",
  Fees: "Flat 0.5 USDG open fee per order unless refunded, plus a 5% fee on settled trader profits. Trader losses go to the treasury that backs payouts and are not counted as fees.",
  UserFees: "Open fees and profit fees paid by traders.",
  Revenue: "Fees minus the builder carve; there are no liquidity providers.",
  SupplySideRevenue: "Builder carve paid to the frontend that placed the order, out of the operations share.",
  HoldersRevenue: "MOG bought back and burned by the buyback wallet, valued at the MOG price. 70% of profit fees accrue to that wallet; only the MOG it burns is counted.",
  ProtocolRevenue: "Revenue minus holders revenue.",
};

const breakdownMethodology = {
  Fees: {
    [OPEN_FEES]: "Flat 0.5 USDG fee per order, kept when the order fills, is cancelled or expires; fees refunded on a pause, delist or terms change are excluded.",
    [PROFIT_FEES]: "5% of settled profit charged on winning positions at payout.",
  },
  UserFees: {
    [OPEN_FEES]: "Flat 0.5 USDG fee per order unless refunded.",
    [PROFIT_FEES]: "5% of settled profit on winning positions.",
  },
  Revenue: {
    [OPEN_FEES]: "Open fees retained by the protocol.",
    [PROFIT_FEES]: "Profit fees retained by the protocol, net of the builder carve.",
  },
  SupplySideRevenue: {
    [BUILDER_FEES]: "Builder carve from the operations share of profit fees.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "MOG burned by the buyback wallet after buying it.",
  },
  ProtocolRevenue: {
    [OPEN_FEES]: "Open fees funding protocol operations.",
    [PROFIT_FEES]: "Profit fees, net of the builder carve.",
    [METRIC.TOKEN_BUY_BACK]: "Buyback burns moved to holders revenue.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-18",
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
