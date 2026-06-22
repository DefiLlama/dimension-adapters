import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  // RUNE-denominated gas/network fee for THORChain outbound transactions, from on-chain gas events.
  // defi_gas_events stays current, unlike Midgard reserve.networkFee and the defi_fee_events / defi_swaps
  // spells, which stalled after the late-May-2026 THORChain event-pipeline break.
  const rows = await queryDuneSql(
    options,
    `SELECT SUM(rune_e8) / 1e8 AS gas_rune
     FROM thorchain.defi_gas_events
     WHERE TIME_RANGE`
  );

  const gasRune = Number(rows?.[0]?.gas_rune ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("thorchain", gasRune, "Gas Fees");

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "Gas/network fees paid for outbound transactions on THORChain, denominated in RUNE, from on-chain gas events (Dune thorchain.defi_gas_events).",
  Revenue: "The RUNE-denominated network gas fee charged for THORChain transactions.",
  ProtocolRevenue: "The RUNE-denominated network gas fee charged for THORChain transactions.",
};

const breakdownMethodology = {
  Fees: { "Gas Fees": "RUNE value of gas spent on THORChain outbound transactions ." },
  Revenue: { "Gas Fees": "RUNE value of gas spent on THORChain outbound transactions." },
  ProtocolRevenue: { "Gas Fees": "RUNE value of gas spent on THORChain outbound transactions." },
};

const adapter: Adapter = {
  version: 1,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.THORCHAIN],
  start: "2021-04-11",
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
