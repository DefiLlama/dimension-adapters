import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { fetchEthVaults } from "./ethVaults";
import { fetchTruAPT } from "./truAPT";
import { fetchTruNEAR } from "./truNEAR";
import { fetchTruINJ } from "./truINJ";
import { fetchTruSOL } from "./truSOL";

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchEthVaults, start: "2023-11-27" },
    [CHAIN.APTOS]: { fetch: fetchTruAPT, start: "2024-06-01" },
    //[CHAIN.NEAR]: { fetch: fetchTruNEAR, start: "2024-06-01" },
    //[CHAIN.INJECTIVE]: { fetch: fetchTruINJ, start: "2024-06-01" },
    //[CHAIN.SOLANA]: { fetch: fetchTruSOL, start: "2024-06-01" },
  },
  methodology: {
    Fees:
      "Gross staking rewards generated across all TruStake vaults (TruMATIC, TruPOL, TruAPT, TruNEAR, TruINJ, TruSOL), including the 5% protocol service fee.",
    Revenue:
      "5% service fee on net staking rewards retained by TruYields protocol treasury.",
    ProtocolRevenue:
      "5% service fee on net staking rewards sent to TruYields treasury.",
    SupplySideRevenue:
      "95% of net staking rewards distributed to TruStake LST holders via exchange rate appreciation.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]:
        "Gross staking rewards from validator delegation across all TruStake vaults, computed from exchange rate changes.",
    },
    Revenue: {
      [METRIC.SERVICE_FEES]:
        "5% service fee on net staking rewards retained by TruYields treasury.",
    },
    ProtocolRevenue: {
      [METRIC.SERVICE_FEES]:
        "5% service fee on net staking rewards retained by TruYields treasury.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]:
        "Net staking rewards distributed to TruStake LST holders via exchange rate appreciation.",
    },
  },
};

export default adapter;
