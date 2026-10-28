import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Same current and historical deployments tracked by dexs/pred/index.ts.
// Both exchanges and cross-matching adapters emit OrderFilled for fills they execute.
const EXCHANGES = [
  "0x03C6c6fbdc0c719Dc878fCe24deBaBC31B2B4a27", // CTF exchange
  "0x90B036c618196634200F0323c420C50CdBBCf07C", // Neg-risk exchange
  "0xd3460060A8363C24babC411a11444d5d985342EF", // Cross-matching adapter
  "0x3d6726aF35Ae695E056e6e2ebDB5c813b7d8B6CC", // Legacy neg-risk exchange
  "0x74AD4708928628c20608F10751EaFBE391197b0F", // Legacy cross-matching adapter
  "0xcc9D4EA7c86f2d6d67a44BC5e7A8932699ddDDa1", // Legacy neg-risk exchange v2
  "0x7B39c530C3F2Ea4056f1a3bBa777F82bBDFB047A", // Legacy cross-matching adapter v2
  "0x1938Af63B717B80ea62ccB4CCBf799F8a28dEFB0", // Legacy neg-risk exchange v3
  "0xC574A05e622A769e6aB14293070cDF6cADB55F98", // Legacy cross-matching adapter v3
];

const ORDER_FILLED_ABI = 'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const fills = await options.getLogs({
    targets: EXCHANGES,
    eventAbi: ORDER_FILLED_ABI,
  });

  // Count the fee once at execution. Transfers, FeeCharged and subsequent vault
  // receipts describe the same fee and must not be added separately.
  // Example: logs 185–189 record one 1.12-share fee at $0.36, worth $0.4032:
  // https://basescan.org/tx/0xa94f0ea322e01818822d1e2d2e23fecbcdd1bb3805d5bdf7330c71d985b7ee21#eventlog
  for (const fill of fills) {
    const fee = new BigNumber(fill.fee.toString());
    if (fee.isZero()) continue;

    // Asset ID 0 is USDC. Fees are denominated in the asset received by
    // the order maker (takerAssetId). USDC and outcome shares use 6 decimals.
    let feeUsd: BigNumber;
    if (fill.takerAssetId.toString() === '0') {
      feeUsd = fee.dividedBy(1e6);
    } else if (fill.makerAssetId.toString() === '0') {
      const shares = new BigNumber(fill.takerAmountFilled.toString());
      if (!shares.isFinite() || shares.lte(0)) throw new Error('Pred: nonzero fee on a fill with no shares');
      // USDC paid / gross shares received gives USD per share (e.g. 0.36).
      // Keep raw amounts precise until the final USD conversion.
      feeUsd = fee.multipliedBy(fill.makerAmountFilled.toString()).dividedBy(shares).dividedBy(1e6);
    } else {
      throw new Error('Pred: cannot price a fee without a USDC side');
    }
    if (!feeUsd.isFinite() || feeUsd.isNegative()) throw new Error('Pred: invalid fee value');
    dailyFees.addUSDValue(feeUsd.toNumber(), 'Trading Fees');
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Fees: "Trading fees paid by users on Pred prediction-market trades on Base, valued at execution prices; excludes later transfers and redemptions of collected fees.",
  Revenue: "All recorded on-chain trade fees accrue to the protocol for the current deployment.",
  ProtocolRevenue: "All recorded on-chain trade fees accrue to the protocol for the current deployment.",
};

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "Fees recorded once per order fill on Pred exchanges and cross-matching adapters; USDC is valued at $1 and outcome-token fees at the fill price.",
  },
  Revenue: {
    "Trading Fees": "Fees recorded once per order fill on Pred exchanges and cross-matching adapters; USDC is valued at $1 and outcome-token fees at the fill price.",
  },
  ProtocolRevenue: {
    "Trading Fees": "Fees recorded once per order fill on Pred exchanges and cross-matching adapters; USDC is valued at $1 and outcome-token fees at the fill price.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-02-05",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
