import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// EL Perps (by EL-Casino) — permissionless perpetuals on Robinhood Chain. ElcasMarketsHub (source verified on
// Sourcify) gives every margin token its own book (a CREATE2 clone); each trade is one taker against the market's LP
// vault, so opening and closing notional are both counted once. Fees are paid in that book's token.
// Fee split, from ElcasPerpsBook._cutFees: hub.perpsProtocolBps() of every open / close fee accrues to the platform
// (FeeAccrued to address(0), later claimProtocol → the hub's fee address), the market's creatorShareBps accrues to its
// creator (FeeAccrued to the creator), the rest stays in the market's LP vault; borrow goes to the LP vault in full.
const HUB = "0xBd65EE837e57D5060013cbE8bAc8a6d0F8037f45";
const ZERO = ADDRESSES.null;

const OPENED = "event PositionOpened(uint256 indexed id, uint256 indexed market, address indexed owner, bool isLong, uint256 collateral, uint256 size, int24 entryTick, uint256 fee)";
const CLOSED = "event PositionClosed(uint256 indexed id, uint256 indexed market, address indexed owner, int24 exitTick, int256 pnl, uint256 borrow, uint256 fee, uint256 payout)";
const DECREASED = "event PositionDecreased(uint256 indexed id, uint256 indexed market, address indexed owner, uint256 fractionBps, int24 exitTick, int256 pnl, uint256 payout)";
const ACCRUED = "event FeeAccrued(address indexed to, uint256 amount)";
const POSITION = "function getPosition(uint256) view returns ((address owner, uint32 market, bool isLong, uint8 state, int24 entryTick, uint8 leverage, uint64 openedAt, uint64 scanFrom, uint16 closeFeeBps, uint16 borrowBpsPerHour, uint16 maintBps, uint256 collateral, uint256 size, uint256 maxProfit, uint256 aPart))";
const MARKETS = "function marketsPage(uint256 from, uint256 n) view returns ((address pool, bool assetIs0, bool paused, bool halted, address creator, int24 refTick, (uint8 maxLeverage, uint16 openFeeBps, uint16 closeFeeBps, uint16 borrowBpsPerHour, uint16 creatorShareBps, uint16 maxProfitX, uint128 minCollateral, uint128 maxCollateral) terms, uint256 vaultAssets, uint256 reserved, uint256 totalShares, uint256 collateral, uint256 sLong, uint256 sShort, uint256 aLong, uint256 aShort)[] out, uint256 total)";

const L = {
  open: "Open Fees",
  close: "Close Fees",
  borrow: "Borrow Fees",
  toProtocol: "Trading Fees To Protocol",
  toCreators: "Trading Fees To Market Creators",
  toLps: "Trading Fees To LP Vaults",
  borrowToLps: "Borrow Fees To LP Vaults",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const openInterestAtEnd = options.createBalances();
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const tokens: string[] = await options.api.call({ abi: "address[]:allPerpsTokens", target: HUB });
  if (!tokens.length) return { dailyVolume, openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
  const books: string[] = await options.api.multiCall({ abi: "function perpsBook(address) view returns (address)", target: HUB, calls: tokens });

  const [openedByBook, closedByBook, decreasedByBook, accruedByBook, markets, protocolBpsRaw] = await Promise.all([
    options.getLogs({ targets: books, eventAbi: OPENED, flatten: false }),
    options.getLogs({ targets: books, eventAbi: CLOSED, flatten: false }),
    options.getLogs({ targets: books, eventAbi: DECREASED, onlyArgs: false, flatten: false }),
    options.getLogs({ targets: books, eventAbi: ACCRUED, onlyArgs: false, flatten: false }),
    // open interest at the end of the window: every market's long + short size (a stock metric, read once)
    options.toApi.multiCall({ abi: MARKETS, calls: books.map((target) => ({ target, params: [0, 1000] })) }),
    options.api.call({ abi: "uint16:perpsProtocolBps", target: HUB }),
  ]);
  const protocolBps = Number(protocolBpsRaw);

  const closedCalls: { target: string; params: any[] }[] = [];
  const closedTokens: string[] = [];
  // a partial close needs the position size one block before the event; group those reads by that block
  const decreasedByBlock = new Map<number, { target: string; id: any; token: string; fractionBps: bigint }[]>();

  books.forEach((book, i) => {
    const token = tokens[i];
    let trading = 0n, protocol = 0n, creators = 0n;
    for (const l of openedByBook[i] ?? []) {
      dailyVolume.add(token, l.size);
      dailyFees.add(token, l.fee, L.open);
      trading += BigInt(l.fee);
    }
    // a fully closed position keeps its last size on-chain (ElcasPerpsBook._settle only shrinks it on partial closes)
    for (const l of closedByBook[i] ?? []) {
      closedCalls.push({ target: book, params: [l.id] });
      closedTokens.push(token);
      dailyFees.add(token, l.fee, L.close);
      trading += BigInt(l.fee);
      dailyFees.add(token, l.borrow, L.borrow);
      dailySupplySideRevenue.add(token, l.borrow, L.borrowToLps);
    }
    const decreased = decreasedByBook[i] ?? [];
    for (const l of decreased) {
      const block = Number(l.blockNumber) - 1;
      const group = decreasedByBlock.get(block) ?? [];
      group.push({ target: book, id: l.args.id, token, fractionBps: BigInt(l.args.fractionBps) });
      decreasedByBlock.set(block, group);
    }
    const accrued = (accruedByBook[i] ?? []) as any[];
    for (const l of accrued) {
      if (String(l.args.to).toLowerCase() === ZERO) protocol += BigInt(l.args.amount);
      else creators += BigInt(l.args.amount);
    }
    // a partial close emits no fee field: its close fee is recovered from the platform's cut accrued in the same tx
    // (cut = fee × protocolBps / 10 000, ElcasPerpsBook._settle → _cutFees)
    if (protocolBps > 0 && decreased.length) {
      const txs = new Set(decreased.map((l: any) => l.transactionHash));
      for (const l of accrued) {
        if (!txs.has(l.transactionHash) || String(l.args.to).toLowerCase() !== ZERO) continue;
        const fee = BigInt(l.args.amount) * 10_000n / BigInt(protocolBps);
        dailyFees.add(token, fee, L.close);
        trading += fee;
      }
    }
    dailyRevenue.add(token, protocol, L.toProtocol);
    dailySupplySideRevenue.add(token, creators, L.toCreators);
    const lps = trading - protocol - creators;
    if (lps > 0n) dailySupplySideRevenue.add(token, lps, L.toLps);
    for (const k of markets[i].out) {
      longOpenInterestAtEnd.add(token, k.sLong);
      shortOpenInterestAtEnd.add(token, k.sShort);
      openInterestAtEnd.add(token, k.sLong);
      openInterestAtEnd.add(token, k.sShort);
    }
  });

  if (closedCalls.length) {
    const ps = await options.toApi.multiCall({ abi: POSITION, calls: closedCalls });
    ps.forEach((p: any, i: number) => dailyVolume.add(closedTokens[i], p.size));
  }
  for (const [block, group] of decreasedByBlock) {
    const ps = await options.api.multiCall({ abi: POSITION, calls: group.map((d) => ({ target: d.target, params: [d.id] })), block });
    group.forEach((d, i) => dailyVolume.add(d.token, BigInt(ps[i].size) * d.fractionBps / 10_000n));
  }
  return {
    dailyVolume,
    openInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-06",
  methodology: {
    Volume: "Notional of positions opened plus notional closed (full and partial closes, take profit / stop loss), across every margin token's book.",
    OpenInterest: "Long and short position size open in every market at the end of the period.",
    Fees: "Open and close fees (a share of the position size, set per market) and hourly borrow paid by traders.",
    UserFees: "Open and close fees and borrow paid by traders.",
    Revenue: "The platform's share of open and close fees (currently 10 %), accrued for the platform's fee address.",
    ProtocolRevenue: "The platform's share of open and close fees, accrued for the platform's fee address.",
    SupplySideRevenue: "The rest of the open and close fees and all borrow go to each market's LP vault; the market's creator takes up to 20 % of the open and close fees.",
  },
  breakdownMethodology: {
    Fees: {
      [L.open]: "Fee charged when a position opens.",
      [L.close]: "Fee charged when a position closes, fully, partially or through its take profit / stop loss.",
      [L.borrow]: "Hourly borrow on the position size, paid when it closes.",
    },
    Revenue: {
      [L.toProtocol]: "The platform's share of open and close fees.",
    },
    ProtocolRevenue: {
      [L.toProtocol]: "The platform's share of open and close fees.",
    },
    SupplySideRevenue: {
      [L.toCreators]: "The market creator's share of open and close fees.",
      [L.toLps]: "The rest of the open and close fees, kept by the market's LP vault.",
      [L.borrowToLps]: "Borrow, kept by the market's LP vault.",
    },
  },
};

export default adapter;
