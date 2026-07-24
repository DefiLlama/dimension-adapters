// Tirelire — Fees & Revenue adapter for DefiLlama dimension-adapters.
//
// TARGET PATH IN THE PR: fees/tirelire.ts
// Repo: https://github.com/DefiLlama/dimension-adapters  (TypeScript)
//
// The canonical Gamma fees adapter (fees/gamma.ts) pulls from Gamma's own API
// (wire2.gamma.xyz), which only covers Hypervisors registered with Gamma's
// backend. Tirelire is an INDEPENDENT verbatim deployment on Robinhood Chain and
// is not in that API, so we read fees straight from the chain instead.
//
// Fee mechanics (verbatim Gamma Hypervisor.sol `_zeroBurn`):
//   pool.collect(...) pulls the position's accrued Uniswap V3 trading fees as
//   (owed0, owed1), then emits:
//       event ZeroBurn(uint8 fee, uint256 fees0, uint256 fees1)
//   where fees0/fees1 == owed0/owed1 == the TOTAL fees collected, and the
//   protocol treasury (feeRecipient) is sent owed{0,1} / fee. Both live vaults
//   run fee = 10 (a 10% cut), and the divisor is emitted per event, so we read
//   it from the log rather than hardcoding.
//
//   => dailyFees            = Σ (fees0 + fees1)            [all trading fees collected]
//      dailyRevenue         = Σ (fees0/fee + fees1/fee)    [10% protocol cut]
//      dailyProtocolRevenue = dailyRevenue                 [all revenue is protocol's]
//
// NOTE: fees are collected on-chain only when a position is touched (rebalance /
// compound / withdraw), not continuously — so daily fees read ~0 on days with no
// such call and spike on collection days. This is the true, honest fee signal for
// this design; it is not a bug in the adapter.

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const HYPERVISORS = [
  "0xb9F974d19425d93B3a9dC80c8f0d3aE428Cbb2B2", // Tirelire USDG-WETH (0.05%)
  "0xcFefe9Ee6B45587939debB869394190432e72258", // Tirelire USDG-NVDA (0.05%)
];

const ZERO_BURN = "event ZeroBurn(uint8 fee, uint256 fees0, uint256 fees1)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const target of HYPERVISORS) {
    const [token0, token1] = await Promise.all([
      options.api.call({ abi: "address:token0", target }),
      options.api.call({ abi: "address:token1", target }),
    ]);

    const logs = await options.getLogs({ target, eventAbi: ZERO_BURN });
    for (const log of logs) {
      const fees0 = BigInt(log.fees0);
      const fees1 = BigInt(log.fees1);
      const divisor = BigInt(Number(log.fee) || 1);

      dailyFees.add(token0, fees0);
      dailyFees.add(token1, fees1);
      // Integer division mirrors the contract's SafeMath `.div(fee)` cut.
      dailyRevenue.add(token0, fees0 / divisor);
      dailyRevenue.add(token1, fees1 / divisor);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-07-22" }, // flagship deploy date
  },
  methodology: {
    Fees: "All Uniswap V3 trading fees collected by the positions each Tirelire Hypervisor manages, summed on-chain from ZeroBurn events.",
    Revenue: "The 10% performance fee taken from collected trading fees and sent to the protocol treasury (fees / fee, with the divisor read from each ZeroBurn event).",
    ProtocolRevenue: "Same as Revenue — the 10% performance fee retained by the protocol treasury.",
  },
};

export default adapter;
