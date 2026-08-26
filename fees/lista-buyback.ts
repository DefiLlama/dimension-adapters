import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * Lista — LISTA buy-back (protocol-wide).
 *
 * Lista routes protocol revenue from ALL products (Lending/Moolah, CDP/lisUSD,
 * RWA, DEX, slisBNB, ...) into a shared execution wallet, swaps it for LISTA on
 * BSC DEXs, and deposits the LISTA into the buy-back pool below. This adapter
 * reads the LISTA actually landing in that pool — the on-chain, verifiable total
 * buy-back — and reports it as HoldersRevenue.
 *
 * Reported ONCE, at the protocol level (not inside any single product adapter):
 * the funding is pooled across products and cannot be attributed to any one of
 * them on-chain.
 *
 * `doublecounted`: the buy-back is funded by protocol revenue that the per-product
 * Lista fee adapters already report, so this adapter is flagged so its value is
 * not double counted in aggregate DeFi fee/revenue totals.
 *
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-buyback
 */
const LISTA = "0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46";
// Buy-back pool — the same address the Lista buy-back dashboard reads as the
// realtime buy-back balance. LISTA is only ever sent here by the buy-back
// executor, so every inbound LISTA transfer is a buy-back.
const BUYBACK_POOL = "0xD08BE4Fe91E5786CeC1D3Bce58c2A16c3efcA179";

const fetch = async (options: FetchOptions) => {
  // LISTA received by the buy-back pool, valued in USD at time of transfer.
  const buyback = await addTokensReceived({
    options,
    target: BUYBACK_POOL,
    tokens: [LISTA],
  });

  const dailyHoldersRevenue = buyback.clone(1, METRIC.TOKEN_BUY_BACK);

  return {
    // Buy-back is a reallocation of already-earned protocol revenue, not new
    // income, hence `doublecounted` below. All of it accrues to LISTA holders.
    dailyFees: dailyHoldersRevenue,
    dailyRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: options.createBalances(),
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "LISTA bought back with Lista protocol revenue (across all products) and deposited into the buy-back pool.",
  Revenue: "All buy-back value accrues to LISTA holders.",
  ProtocolRevenue: "None — the buy-back is distributed to holders, not retained by the protocol.",
  HoldersRevenue:
    "Protocol revenue used to buy back LISTA, measured from LISTA deposited into the on-chain buy-back pool.",
};

const breakdownMethodology = {
  Fees: { [METRIC.TOKEN_BUY_BACK]: "LISTA deposited into the buy-back pool." },
  Revenue: { [METRIC.TOKEN_BUY_BACK]: "LISTA deposited into the buy-back pool." },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "LISTA deposited into the buy-back pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  fetch,
  start: "2026-04-08", // buy-back program went live 2026-04-08
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
