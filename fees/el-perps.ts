import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// EL Perps (by EL-Casino) — permissionless perpetuals on Robinhood Chain. ElcasMarketsHub (source verified on
// Sourcify) gives every margin token its own book (a CREATE2 clone); fees are paid in that book's token.
// Fee split, from ElcasPerpsBook._cutFees: hub.perpsProtocolBps() of every open / close fee accrues to the platform
// (FeeAccrued to address(0), later claimProtocol → the hub's fee address), the market's creatorShareBps accrues to its
// creator (FeeAccrued to the creator), the rest stays in the market's LP vault; borrow goes to the LP vault in full.
const HUB = "0xBd65EE837e57D5060013cbE8bAc8a6d0F8037f45";
const ZERO = "0x0000000000000000000000000000000000000000";

const OPENED = "event PositionOpened(uint256 indexed id, uint256 indexed market, address indexed owner, bool isLong, uint256 collateral, uint256 size, int24 entryTick, uint256 fee)";
const CLOSED = "event PositionClosed(uint256 indexed id, uint256 indexed market, address indexed owner, int24 exitTick, int256 pnl, uint256 borrow, uint256 fee, uint256 payout)";
const DECREASED = "event PositionDecreased(uint256 indexed id, uint256 indexed market, address indexed owner, uint256 fractionBps, int24 exitTick, int256 pnl, uint256 payout)";
const ACCRUED = "event FeeAccrued(address indexed to, uint256 amount)";

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
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const tokens: string[] = await options.api.call({ abi: "address[]:allPerpsTokens", target: HUB });
  const books: string[] = await options.api.multiCall({ abi: "function perpsBook(address) view returns (address)", target: HUB, calls: tokens });
  const protocolBps = Number(await options.api.call({ abi: "uint16:perpsProtocolBps", target: HUB }));
  for (let i = 0; i < books.length; i++) {
    const book = books[i], token = tokens[i];
    const opened = await options.getLogs({ target: book, eventAbi: OPENED });
    const closed = await options.getLogs({ target: book, eventAbi: CLOSED });
    const decreased = await options.getLogs({ target: book, eventAbi: DECREASED, onlyArgs: false });
    const accrued = await options.getLogs({ target: book, eventAbi: ACCRUED, onlyArgs: false });
    let trading = 0n, protocol = 0n, creators = 0n;
    for (const l of opened) { dailyFees.add(token, l.fee, L.open); trading += BigInt(l.fee); }
    for (const l of closed) {
      dailyFees.add(token, l.fee, L.close); trading += BigInt(l.fee);
      dailyFees.add(token, l.borrow, L.borrow); dailySupplySideRevenue.add(token, l.borrow, L.borrowToLps);
    }
    for (const l of accrued as any[]) { if (String(l.args.to).toLowerCase() === ZERO) protocol += BigInt(l.args.amount); else creators += BigInt(l.args.amount); }
    // a partial close emits no fee field: its close fee is recovered from the platform's cut accrued in the same tx
    // (cut = fee × protocolBps / 10 000, ElcasPerpsBook._settle → _cutFees)
    if (protocolBps > 0 && decreased.length) {
      const txs = new Set((decreased as any[]).map((l) => l.transactionHash));
      for (const l of accrued as any[]) {
        if (!txs.has(l.transactionHash) || String(l.args.to).toLowerCase() !== ZERO) continue;
        const fee = BigInt(l.args.amount) * 10_000n / BigInt(protocolBps);
        dailyFees.add(token, fee, L.close); trading += fee;
      }
    }
    dailyRevenue.add(token, protocol, L.toProtocol);
    dailySupplySideRevenue.add(token, creators, L.toCreators);
    const lps = trading - protocol - creators;
    if (lps > 0n) dailySupplySideRevenue.add(token, lps, L.toLps);
  }
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-06",
  methodology: {
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
