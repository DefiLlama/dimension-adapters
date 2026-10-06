import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// EL Predict (by EL-Casino) — UP / DOWN price rounds on Robinhood Chain. ElcasMarketsHub (source verified on
// Sourcify) gives every stake token its own book (a CREATE2 clone); fees are paid in that book's token.
// Fee split, from ElcasPredictBook._settle: a round's fee (feeBps, ≤ 6 % of its losing side) is split into the
// platform's share (FeeAccrued to address(0) → claimProtocol → the hub's fee address), the market creator's share
// (FeeAccrued to the creator), the settler's bounty (Bounty) and the rest to the market's house vault (Settled.toHouse).
// When a market has no house LPs the rest goes back to the winners and is not a fee.
const HUB = "0xBd65EE837e57D5060013cbE8bAc8a6d0F8037f45";
const ZERO = "0x0000000000000000000000000000000000000000";

const SETTLED = "event Settled(uint256 indexed market, uint256 indexed epoch, uint8 status, uint256 payout, uint256 toProtocol, uint256 toHouse, uint256 houseResult)";
const BOUNTY = "event Bounty(uint256 indexed market, uint256 indexed epoch, address indexed settler, uint256 amount)";
const ACCRUED = "event FeeAccrued(address indexed to, uint256 amount)";

const L = {
  fees: "Round Fees",
  toProtocol: "Round Fees To Protocol",
  toCreators: "Round Fees To Market Creators",
  toHouse: "Round Fees To House Vaults",
  toSettlers: "Round Fees To Settlers",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const tokens: string[] = await options.api.call({ abi: "address[]:allPredictTokens", target: HUB });
  const books: string[] = await options.api.multiCall({ abi: "function predictBook(address) view returns (address)", target: HUB, calls: tokens });
  for (let i = 0; i < books.length; i++) {
    const book = books[i], token = tokens[i];
    const settled = await options.getLogs({ target: book, eventAbi: SETTLED });
    const bounties = await options.getLogs({ target: book, eventAbi: BOUNTY });
    const accrued = await options.getLogs({ target: book, eventAbi: ACCRUED });
    for (const l of accrued) {
      dailyFees.add(token, l.amount, L.fees);
      if (String(l.to).toLowerCase() === ZERO) dailyRevenue.add(token, l.amount, L.toProtocol);
      else dailySupplySideRevenue.add(token, l.amount, L.toCreators);
    }
    for (const l of settled) { dailyFees.add(token, l.toHouse, L.fees); dailySupplySideRevenue.add(token, l.toHouse, L.toHouse); }
    for (const l of bounties) { dailyFees.add(token, l.amount, L.fees); dailySupplySideRevenue.add(token, l.amount, L.toSettlers); }
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
    Fees: "The fee taken from each settled round's losing side (set per market, up to 6 %).",
    UserFees: "The fee taken from each settled round's losing side.",
    Revenue: "The platform's share of each round's fee (currently 1 % of the losing side).",
    ProtocolRevenue: "The platform's share of each round's fee, accrued for the platform's fee address.",
    SupplySideRevenue: "The market's house vault LPs, the market's creator and whoever settles the round (bounty).",
  },
  breakdownMethodology: {
    Fees: {
      [L.fees]: "The fee taken from each settled round's losing side.",
    },
    Revenue: {
      [L.toProtocol]: "The platform's share of the round fee.",
    },
    ProtocolRevenue: {
      [L.toProtocol]: "The platform's share of the round fee.",
    },
    SupplySideRevenue: {
      [L.toCreators]: "The market creator's share of the round fee (up to 2 % of the losing side).",
      [L.toHouse]: "The rest of the round fee, kept by the market's house vault.",
      [L.toSettlers]: "The settle bounty paid to whoever settles the round (up to 1 % of the losing side).",
    },
  },
};

export default adapter;
