// prynt — fees & revenue adapter (dimension-adapters).
//
// Fee sources on Robinhood Chain (chainId 4663):
//   1) Token creation fee: a flat fee paid on createToken(), forwarded to the Treasury. Captured exactly
//      from the Treasury's Deposited(from, amount) logs where `from` == the factory (robust to any future
//      change of the creation-fee amount, and excludes graduation refunds which arrive from the Migrator).
//   2) Trade fee: an inclusive fee (<= 2%) charged on the ETH leg of every bonding-curve buy/sell, emitted
//      by the FeeManager as FeesCollected(token, creator, totalFee, creatorFee, protocolFee).
//
// dailyFees             = creation fees + trade totalFee            (everything users pay)
// dailyRevenue          = creation fees + trade protocolFee         (protocol's take)
// dailySupplySideRevenue= trade creatorFee                          (creators; currently disabled == 0)
// Identity holds: dailyFees == dailyRevenue + dailySupplySideRevenue (totalFee == protocolFee + creatorFee).
//
// Destination file in the PR: fees/prynt.ts
//
// -----------------------------------------------------------------------------------------------------
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FACTORY = "0x5c0cdFA92C6645b6ee83e686598DbC29260F885d";
const FEE_MANAGER = "0x181e56B1d5BBf2A17089e4aAa576EAeCEeE1Ee40";
const TREASURY = "0xCE1d15eC90738F9cd60fE4f8239a10eFb056eEa1";

const FEES_COLLECTED =
  "event FeesCollected(address indexed token, address indexed creator, uint256 totalFee, uint256 creatorFee, uint256 protocolFee)";
const DEPOSITED = "event Deposited(address indexed from, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // (1) creation fees — Treasury deposits that originate from the factory
  const deposits = await options.getLogs({ target: TREASURY, eventAbi: DEPOSITED });
  for (const d of deposits) {
    if (d.from.toLowerCase() === FACTORY.toLowerCase()) {
      dailyFees.addGasToken(d.amount, "Creation Fees");
      dailyRevenue.addGasToken(d.amount, "Creation Fees");
    }
  }

  // (2) trade fees — from the FeeManager
  const collected = await options.getLogs({ target: FEE_MANAGER, eventAbi: FEES_COLLECTED });
  for (const c of collected) {
    dailyFees.addGasToken(c.totalFee, "Trade Fees");
    dailyRevenue.addGasToken(c.protocolFee, "Trade Fees");
    dailySupplySideRevenue.addGasToken(c.creatorFee, "Creator Fees"); // 0 while creator fees are disabled
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "All fees paid by users: the flat token-creation fee plus the bonding-curve trade fee (an inclusive fee capped at 2%, charged on the ETH leg of every buy and sell).",
    Revenue: "Protocol revenue: the full creation fee plus the protocol slice of trade fees.",
    SupplySideRevenue:
      "Creator slice of the bonding-curve trade fee. Creator fees are currently disabled, so this is 0 today; it is populated automatically if they are re-enabled.",
  },
  breakdownMethodology: {
    Fees: {
      "Creation Fees": "Flat fee paid on each token creation, forwarded to the Treasury.",
      "Trade Fees": "Bonding-curve trade fee (inclusive, capped at 2%) on the ETH leg of every buy and sell.",
    },
    Revenue: {
      "Creation Fees": "The full creation fee is protocol revenue (kept by the Treasury).",
      "Trade Fees": "Protocol slice of the bonding-curve trade fee.",
    },
    SupplySideRevenue: {
      "Creator Fees": "Creator slice of the bonding-curve trade fee (currently disabled, so 0).",
    },
  },
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-07-07",
    },
  },
};

export default adapter;
