// Bonker is a token launchpad on Base. Tokens launched through its factory trade in
// Uniswap v4 pools whose hooks charge two swap-fee streams:
//   - the Uniswap LP fee, paid to launch-configured reward recipients; and
//   - an additional protocol fee equal to 20% of that LP fee, paid to Bonker.
//
// Each live Bonker hook emits ClaimProtocolFees when it realizes protocol revenue
// from PoolManager accounting into the Bonker factory. The LP locker separately
// emits StoreTokens through BonkerFeeLocker when it credits swap fees to launch-
// configured reward recipients. Counting both flows avoids estimating the LP side
// from the nominal 20% protocol-fee rate and its per-swap integer rounding.
//
// Sources:
//   https://basescan.org/address/0x963E91A45148b39737b9DF10c5b897B55cA9e8cC#code
//   https://basescan.org/address/0xC9156C1868E122eF5b3e6ed946e1E88ff7da68Cc#code

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Current Base mainnet hooks, deployed with the factory at block 43,000,832.
const BONKER_HOOKS = [
  "0x963E91A45148b39737b9DF10c5b897B55cA9e8cC", // dynamic-fee hook
  "0xC9156C1868E122eF5b3e6ed946e1E88ff7da68Cc", // static-fee hook
];
// Bonker LP locker; emits swap-fee deposits to the fee locker.
// Source: https://basescan.org/address/0xBf05b1d5E356f3219D0086A4e09c969ADbe2e7d0#code
const LP_LOCKER = "0xBf05b1d5E356f3219D0086A4e09c969ADbe2e7d0";
// Bonker fee locker; credits LP fees to launch-configured reward recipients.
// Source: https://basescan.org/address/0x473e52D89bE6ea78f94d1b5c62Bd1f01b1E32e21#code
const FEE_LOCKER = "0x473e52D89bE6ea78f94d1b5c62Bd1f01b1E32e21";

const CLAIM_PROTOCOL_FEES =
  "event ClaimProtocolFees(address indexed token, uint256 amount)";
const STORE_TOKENS =
  "event StoreTokens(address indexed sender, address indexed feeOwner, address indexed token, uint256 balance, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const protocolFeeLogs = await options.getLogs({
    targets: BONKER_HOOKS,
    eventAbi: CLAIM_PROTOCOL_FEES,
  });

  for (const log of protocolFeeLogs) {
    dailyFees.add(log.token, log.amount, METRIC.SWAP_FEES);
    dailyRevenue.add(log.token, log.amount, "Swap Fees To Protocol");
  }

  const rewardLogs = await options.getLogs({
    target: FEE_LOCKER,
    eventAbi: STORE_TOKENS,
  });

  for (const log of rewardLogs) {
    // The fee locker also accepts deposits from MEV modules. Restricting the
    // sender to the LP locker counts only Uniswap swap-fee rewards.
    if (log.sender.toLowerCase() !== LP_LOCKER.toLowerCase()) continue;
    dailyFees.add(log.token, log.amount, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(
      log.token,
      log.amount,
      "Swap Fees To Reward Recipients",
    );
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Total swap fees paid by traders in Bonker-launched Uniswap v4 pools: protocol fees realized by the Bonker hooks plus LP fees credited by the Bonker LP locker.",
  Revenue:
    "Bonker's protocol fee, equal to 20% of the imposed LP fee and paid to the Bonker factory.",
  ProtocolRevenue:
    "Bonker's protocol fee, equal to 20% of the imposed LP fee and paid to the Bonker factory.",
  SupplySideRevenue:
    "Uniswap LP fees allocated to token creators, referrers, and other reward recipients configured at launch.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Protocol fees emitted by Bonker hooks plus LP fees stored by the Bonker LP locker.",
  },
  Revenue: {
    "Swap Fees To Protocol":
      "Protocol-fee amounts realized by Bonker hooks and transferred to the Bonker factory.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol":
      "Protocol-fee amounts realized by Bonker hooks and transferred to the Bonker factory.",
  },
  SupplySideRevenue: {
    "Swap Fees To Reward Recipients":
      "LP fees credited to token creators, referrers, and other launch-configured reward recipients.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  start: "2026-03-06",
  fetch,
  methodology,
  breakdownMethodology,
  // The LP-fee component may also be attributed to Uniswap.
  doublecounted: true,
};

export default adapter;
