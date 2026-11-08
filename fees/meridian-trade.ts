import { CHAIN } from "../helpers/chains";
import { gmxV1Exports } from "../helpers/gmx";

// The perpetuals-stats subgraph (subgraph.meridianfinance.net) no longer resolves (ENOTFOUND), so fees are read from
// the GMX v1 Vault logs on Base. Vault address from DefiLlama-Adapters registries/gmx.js 'meridian-trade'.
// Fee split per https://docs.meridianfinance.net/earning-with-meridian/mlp-liquidity-pool:
// 60% to MLP holders, 30% to MST stakers, 10% to the treasury.
// Swap fees paid out in Meridian's own USDM (0x5e06eA564efcB3158a85dBF0B9E017cb003ff56f) have no price and count as 0.

const methodology = {
  Fees: "Open/close position fees (0.1%), borrow fees, swap fees (0.25% to 0.8%) and MLP mint and burn fees paid to the Meridian Trade vault on Base.",
  UserFees: "Open/close position fees (0.1%), borrow fees and swap fees (0.25% to 0.8%) paid by traders.",
  Revenue: "40% of all fees collected by the vault: 30% to MST stakers and 10% to the treasury.",
  ProtocolRevenue: "10% of all fees collected by the vault, sent to the treasury.",
  HoldersRevenue: "30% of all fees collected by the vault, distributed to MST stakers.",
  SupplySideRevenue: "60% of all fees collected by the vault, distributed to MLP holders.",
};

export default gmxV1Exports({
  [CHAIN.BASE]: {
    vault: "0x853a8cE6B6338f5B0A14BCfc97F9D68396099C9C",
    start: "2023-08-12",
    // last Vault event 2025-02-25 07:37 UTC (tx 0x78ff32355bba843ce21592f1a884ee1a3236c9b842e8b3ed431fb537aeb7096e);
    // no positions, swaps or MLP mints/burns since then
    deadFrom: "2025-02-26",
    ProtocolRevenue: 10,
    SupplySideRevenue: 60,
    HoldersRevenue: 30,
    methodology,
  },
});
