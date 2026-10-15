import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, fetchBordrless } from "../../helpers/bordrless";

const fetch = async (options: FetchOptions) => fetchBordrless(options, "dex");

const methodology = {
  Volume: "Sum of trades on the Bordrless DEX, including launched coins after they graduate.",
  Fees: "Every fee traders pay on trades on the Bordrless DEX, including launched coins after they graduate: the protocol fee, LP fee, coin creator fee and holder reward fee.",
  UserFees: "Every fee traders pay on Bordrless DEX trades: the protocol fee, LP fee, coin creator fee and holder reward fee.",
  Revenue: "The protocol fee, paid to the Bordrless treasury.",
  ProtocolRevenue: "Half of the protocol fee, kept by the treasury.",
  HoldersRevenue: "Half of the protocol fee, spent buying back $BORDR.",
  SupplySideRevenue: "Fees paid to liquidity providers, coin creators and coin holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: { [CHAIN.SOLANA]: { fetch, start: "2026-10-08" } },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
