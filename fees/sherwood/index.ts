import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

// Sherwood (sherwood.cash) — a privacy mixer + shielded DEX on Robinhood chain.
// The vault takes a protocol fee on every shielded withdrawal and swap. By design
// the fee always lands in a quote asset (native ETH or USDG, never a memecoin) and
// is emitted as a ProtocolFeeCharged event, so daily fees are just the sum of those
// amounts priced in USD. There is no supply side, so every fee is protocol revenue.
const VAULT = "0xf54013b8BE8fdFcF0CD1fD727c803F16c2450736";

const PROTOCOL_FEE_CHARGED =
  "event ProtocolFeeCharged(uint256 indexed assetId, address token, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({ target: VAULT, eventAbi: PROTOCOL_FEE_CHARGED });

  for (const log of logs) {
    const token = String(log.token).toLowerCase();
    // Native ETH fees are emitted with token == address(0); any ERC-20 (USDG, or a
    // wrapped asset) keeps its own token identity.
    if (token === ADDRESSES.null) dailyFees.addGasToken(log.amount, METRIC.PROTOCOL_FEES);
    else dailyFees.add(token, log.amount, METRIC.PROTOCOL_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-28",
  fetch,
  methodology: {
    Fees: "Protocol fee charged on shielded withdrawals and swaps, always collected in ETH or USDG (ProtocolFeeCharged events), converted to USD.",
    Revenue: "All protocol fees are kept by the protocol — there is no supply side.",
    ProtocolRevenue: "100% of collected protocol fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee taken by the vault on each shielded withdrawal and swap (ProtocolFeeCharged), in ETH or USDG.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "All protocol fees are protocol revenue — there is no supply side.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "100% of collected protocol fees.",
    },
  },
};

export default adapter;
