import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

/**
 * Maia V3 (Unimaia) - Uniswap V3 fork on Metis
 *
 * Previous implementation used subgraph at https://metis-graph.maiadao.io/uniswap-v3
 * but the SSL certificate expired (Oct 7, 2025). Switched to on-chain log-based
 * data fetching using the factory contract.
 *
 */

const MAIA_V3_FACTORY = "0xf5fd18Cd5325904cC7141cB9Daca1F2F964B9927";

const methodology = {
  UserFees: "User pays 0.01%, 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Protocol receives 10% of fees.",
  SupplySideRevenue: "90% of user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue.",
};

const adapter = uniV3Exports({
  [CHAIN.METIS]: {
    factory: MAIA_V3_FACTORY,
    userFeesRatio: 1, // 100% - users pay all fees
    revenueRatio: 0.1, // 10% goes to revenue (protocol)
    protocolRevenueRatio: 0.1, // 10% of fees go to protocol
    holdersRevenueRatio: 0, // 0% to holders
    start: "2023-04-01",
  },
});

adapter.methodology = methodology;

export default adapter;
