// prynt — fees & revenue adapter (dimension-adapters).
//
// Fee sources on Robinhood Chain (chainId 4663):
//   1) Token creation fee: a flat fee paid on createToken(), forwarded to the Treasury. Captured exactly
//      from the Treasury's Deposited(from, amount) logs where `from` == the factory (robust to any future
//      change of the creation-fee amount, and excludes graduation refunds which arrive from the Migrator).
//   2) Trade fee: an inclusive fee (<= 2%) charged on the ETH leg of every bonding-curve buy/sell, emitted
//      by the FeeManager as FeesCollected(token, creator, totalFee, creatorFee, protocolFee).
//
// dailyFees    = all fees users pay          = creation fees + trade totalFee
// dailyRevenue = protocol's take             = creation fees + trade protocolFee
// Creator fees are currently disabled (creatorFee == 0), so protocol keeps 100% of trade fees today.
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

  // (1) creation fees — Treasury deposits that originate from the factory
  const deposits = await options.getLogs({ target: TREASURY, eventAbi: DEPOSITED });
  for (const d of deposits) {
    if (d.from.toLowerCase() === FACTORY.toLowerCase()) {
      dailyFees.addGasToken(d.amount);
      dailyRevenue.addGasToken(d.amount);
    }
  }

  // (2) trade fees — from the FeeManager
  const collected = await options.getLogs({ target: FEE_MANAGER, eventAbi: FEES_COLLECTED });
  for (const c of collected) {
    dailyFees.addGasToken(c.totalFee);
    dailyRevenue.addGasToken(c.protocolFee);
  }

  return { dailyFees, dailyRevenue };
};

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "All fees paid by users: the flat token-creation fee plus the bonding-curve trade fee (an inclusive fee capped at 2%, charged on the ETH leg of every buy and sell).",
    Revenue:
      "Protocol revenue: the full creation fee plus the protocol slice of trade fees. Creator fees are currently disabled, so the protocol keeps 100% of the trade fee.",
  },
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-07-07",
    },
  },
};

export default adapter;
