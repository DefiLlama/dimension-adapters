import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// EL Perps (by EL-Casino) — permissionless perpetuals on Robinhood Chain. ElcasMarketsHub (source verified on
// Sourcify) gives every margin token its own book (a CREATE2 clone); each trade is one taker against the market's LP
// vault, so opening and closing notional are both counted once.
const HUB = "0xBd65EE837e57D5060013cbE8bAc8a6d0F8037f45";

const OPENED = "event PositionOpened(uint256 indexed id, uint256 indexed market, address indexed owner, bool isLong, uint256 collateral, uint256 size, int24 entryTick, uint256 fee)";
const CLOSED = "event PositionClosed(uint256 indexed id, uint256 indexed market, address indexed owner, int24 exitTick, int256 pnl, uint256 borrow, uint256 fee, uint256 payout)";
const DECREASED = "event PositionDecreased(uint256 indexed id, uint256 indexed market, address indexed owner, uint256 fractionBps, int24 exitTick, int256 pnl, uint256 payout)";
const POSITION = "function getPosition(uint256) view returns ((address owner, uint32 market, bool isLong, uint8 state, int24 entryTick, uint8 leverage, uint64 openedAt, uint64 scanFrom, uint16 closeFeeBps, uint16 borrowBpsPerHour, uint16 maintBps, uint256 collateral, uint256 size, uint256 maxProfit, uint256 aPart))";
const MARKETS = "function marketsPage(uint256 from, uint256 n) view returns ((address pool, bool assetIs0, bool paused, bool halted, address creator, int24 refTick, (uint8 maxLeverage, uint16 openFeeBps, uint16 closeFeeBps, uint16 borrowBpsPerHour, uint16 creatorShareBps, uint16 maxProfitX, uint128 minCollateral, uint128 maxCollateral) terms, uint256 vaultAssets, uint256 reserved, uint256 totalShares, uint256 collateral, uint256 sLong, uint256 sShort, uint256 aLong, uint256 aShort)[] out, uint256 total)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const openInterestAtEnd = options.createBalances();
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();
  const tokens: string[] = await options.api.call({ abi: "address[]:allPerpsTokens", target: HUB });
  const books: string[] = await options.api.multiCall({ abi: "function perpsBook(address) view returns (address)", target: HUB, calls: tokens });
  for (let i = 0; i < books.length; i++) {
    const book = books[i], token = tokens[i];
    const opened = await options.getLogs({ target: book, eventAbi: OPENED });
    const closed = await options.getLogs({ target: book, eventAbi: CLOSED });
    const decreased = await options.getLogs({ target: book, eventAbi: DECREASED, onlyArgs: false });
    for (const l of opened) dailyVolume.add(token, l.size);
    // a fully closed position keeps its last size on-chain (ElcasPerpsBook._settle only shrinks it on partial closes)
    if (closed.length) {
      const ps = await options.toApi.multiCall({ abi: POSITION, target: book, calls: closed.map((l: any) => l.id) });
      ps.forEach((p: any) => dailyVolume.add(token, p.size));
    }
    // a partial close: the position's size one block before it × the closed fraction
    for (const l of decreased as any[]) {
      const p = await options.api.call({ abi: POSITION, target: book, params: [l.args.id], block: Number(l.blockNumber) - 1 });
      dailyVolume.add(token, BigInt(p.size) * BigInt(l.args.fractionBps) / 10_000n);
    }
    // open interest at the end of the window: every market's long + short size (a stock metric, read once)
    const pg = await options.toApi.call({ abi: MARKETS, target: book, params: [0, 1000] });
    for (const k of pg.out) {
      longOpenInterestAtEnd.add(token, k.sLong); shortOpenInterestAtEnd.add(token, k.sShort);
      openInterestAtEnd.add(token, k.sLong); openInterestAtEnd.add(token, k.sShort);
    }
  }
  return { dailyVolume, openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
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
  },
};

export default adapter;
