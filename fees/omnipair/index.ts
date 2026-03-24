import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchOmnipairDuneDaily } from "../../helpers/omnipairDune";

const methodology = {
  Fees: "All swap fees paid by users on Omnipair. Computed from Dune as lp_fee + protocol_fee, grouped by input token mint.",
  Revenue: "Protocol revenue equals the protocol_fee portion of swap fees.",
  ProtocolRevenue: "Protocol revenue equals the protocol_fee portion of swap fees.",
  SupplySideRevenue: "Supply-side revenue equals the lp_fee portion distributed to liquidity providers.",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const rows = await fetchOmnipairDuneDaily(options);

  for (const row of rows) {
    const token = row.token_in_mint;

    dailyVolume.add(token, row.daily_volume);
    dailyFees.add(token, row.daily_fees);
    dailyRevenue.add(token, row.daily_revenue);
    dailyProtocolRevenue.add(token, row.daily_protocol_revenue);
    dailySupplySideRevenue.add(token, row.daily_supply_side_revenue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  start: "2026-02-01",
  methodology,
  dependencies: [Dependencies.DUNE],
  fetch,
};

export default adapter;