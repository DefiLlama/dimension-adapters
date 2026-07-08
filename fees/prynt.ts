// prynt — fees, revenue & volume adapter (dimension-adapters).
//
// Sources on Robinhood Chain (chainId 4663):
//   1) Token creation fee: flat fee on createToken(), forwarded to the Treasury. Captured from the
//      Treasury's Deposited(from, amount) logs where `from` == the factory (robust to fee changes;
//      excludes graduation refunds, which arrive from the Migrator).
//   2) Trade fee: inclusive fee (<= 2%) on the ETH leg of every bonding-curve buy/sell, emitted by the
//      FeeManager as FeesCollected(token, creator, totalFee, creatorFee, protocolFee).
//   3) Volume: per-curve Bought/Sold events. Per the contract docs, the ETH that traded against the
//      curve is `ethSpent - fee` on buys and `ethOut + fee` on sells (ethOut is net-to-seller).
//
// dailyFees              = creation fees + trade totalFee
// dailyRevenue           = creation fees + trade protocolFee        (== dailyProtocolRevenue)
// dailySupplySideRevenue = trade creatorFee                         (currently disabled == 0)
// Identity holds: dailyFees == dailyRevenue + dailySupplySideRevenue.
//
// Destination file in the PR: fees/prynt.ts
//
// -----------------------------------------------------------------------------------------------------
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const FACTORY = "0x5c0cdFA92C6645b6ee83e686598DbC29260F885d";
const FEE_MANAGER = "0x181e56B1d5BBf2A17089e4aAa576EAeCEeE1Ee40";
const TREASURY = "0xCE1d15eC90738F9cd60fE4f8239a10eFb056eEa1";
const FROM_BLOCK = 4394643; // factory deployment block

const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed creator, address indexed curve, string name, string symbol, string metadataURI, uint256 timestamp)";
const FEES_COLLECTED =
  "event FeesCollected(address indexed token, address indexed creator, uint256 totalFee, uint256 creatorFee, uint256 protocolFee)";
const DEPOSITED = "event Deposited(address indexed from, uint256 amount)";
const BOUGHT =
  "event Bought(address indexed buyer, address indexed to, uint256 ethSpent, uint256 tokensOut, uint256 fee, uint128 reserveEth, uint128 reserveToken)";
const SOLD =
  "event Sold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee, uint128 reserveEth, uint128 reserveToken)";

// Module-level curve cache so hourly runs don't re-scan TokenCreated from the deploy block every time:
// each run only scans the blocks added since the last one. The list is append-only (curves are never
// deleted on-chain), so serving a superset to an out-of-order/backfill window is still correct — curves
// created later simply have no Bought/Sold events inside that window.
const curveCache = { curves: [] as string[], toBlock: 0 };

async function getCurves(options: FetchOptions): Promise<string[]> {
  const toBlock: number = await options.getToBlock();
  if (toBlock > curveCache.toBlock) {
    const created = await options.getLogs({
      target: FACTORY,
      eventAbi: TOKEN_CREATED,
      fromBlock: curveCache.toBlock ? curveCache.toBlock + 1 : FROM_BLOCK,
      toBlock,
    });
    for (const l of created) if (!curveCache.curves.includes(l.curve)) curveCache.curves.push(l.curve);
    curveCache.toBlock = toBlock;
  }
  return curveCache.curves;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  // (1) creation fees — Treasury deposits that originate from the factory
  const deposits = await options.getLogs({ target: TREASURY, eventAbi: DEPOSITED });
  for (const d of deposits) {
    if (d.from.toLowerCase() === FACTORY.toLowerCase()) {
      dailyFees.addGasToken(d.amount, "Token Creation Fees");
      dailyRevenue.addGasToken(d.amount, "Token Creation Fees To Treasury");
    }
  }

  // (2) trade fees — from the FeeManager
  const collected = await options.getLogs({ target: FEE_MANAGER, eventAbi: FEES_COLLECTED });
  for (const c of collected) {
    dailyFees.addGasToken(c.totalFee, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(c.protocolFee, "Trade Fees To Protocol");
    dailySupplySideRevenue.addGasToken(c.creatorFee, "Trade Fees To Creators"); // 0 while creator fees are disabled
  }

  // (3) volume — Bought/Sold on every curve (incrementally cached enumeration)
  const curves = await getCurves(options);
  if (curves.length) {
    const buys = await options.getLogs({ targets: curves, eventAbi: BOUGHT });
    const sells = await options.getLogs({ targets: curves, eventAbi: SOLD });
    for (const b of buys) dailyVolume.addGasToken(b.ethSpent - b.fee); // ETH that entered the curve
    for (const s of sells) dailyVolume.addGasToken(s.ethOut + s.fee); // gross ETH that left the curve
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue, dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "ETH value traded against the bonding curves: ETH entering the curve on buys (ex-fee) plus gross ETH leaving on sells.",
    Fees: "All fees paid by users: the flat token-creation fee plus the bonding-curve trade fee (an inclusive fee capped at 2%, charged on the ETH leg of every buy and sell).",
    Revenue: "Protocol revenue: the full creation fee plus the protocol slice of trade fees.",
    ProtocolRevenue: "Same as Revenue — the protocol keeps the full creation fee and its slice of trade fees.",
    SupplySideRevenue:
      "Creator slice of the bonding-curve trade fee. Creator fees are currently disabled, so this is 0 today; it is populated automatically if they are re-enabled.",
  },
  breakdownMethodology: {
    Fees: {
      "Token Creation Fees": "Flat fee paid on each token creation, forwarded to the Treasury.",
      [METRIC.TRADING_FEES]: "Bonding-curve trade fee (inclusive, capped at 2%) on the ETH leg of every buy and sell.",
    },
    Revenue: {
      "Token Creation Fees To Treasury": "The full creation fee is protocol revenue (kept by the Treasury).",
      "Trade Fees To Protocol": "Protocol slice of the bonding-curve trade fee.",
    },
    SupplySideRevenue: {
      "Trade Fees To Creators": "Creator slice of the bonding-curve trade fee (currently disabled, so 0).",
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
