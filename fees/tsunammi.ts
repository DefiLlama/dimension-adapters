import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getSolanaReceived } from "../helpers/token";

// Public service-fee recipient used by Tsunammi's Create Token flow.
// The client constructs a System Program transfer to this address when a token
// is created: https://tool.tsunammi.io/assets/CreateToken-pUM4bPRA.js
const CREATE_TOKEN_FEE_COLLECTOR = "BSCGRr9MunDsuSHA745tf4iu1yMFAS5msipod9zktNy2";
const CREATE_TOKEN_FEES = "Create Token Service Fees";

const fetch = async (options: FetchOptions) => {
  const received = await getSolanaReceived({
    options,
    target: CREATE_TOKEN_FEE_COLLECTOR,
    mints: [ADDRESSES.solana.SOL],
    blacklists: [CREATE_TOKEN_FEE_COLLECTOR],
    blacklist_signers: [CREATE_TOKEN_FEE_COLLECTOR],
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, CREATE_TOKEN_FEES);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(received, CREATE_TOKEN_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-26",
  methodology: {
    Fees: "SOL service fees paid by users to Tsunammi for the Create Token flow.",
    Revenue: "All tracked Create Token service fees are retained as Tsunammi protocol revenue.",
    ProtocolRevenue: "SOL received by Tsunammi's dedicated Create Token fee collector.",
  },
  breakdownMethodology: {
    Fees: {
      [CREATE_TOKEN_FEES]: "SOL received by Tsunammi's public Create Token service-fee collector from external addresses.",
    },
    Revenue: {
      [CREATE_TOKEN_FEES]: "Create Token service fees retained by Tsunammi.",
    },
    ProtocolRevenue: {
      [CREATE_TOKEN_FEES]: "Create Token service fees retained by Tsunammi's protocol treasury.",
    },
  },
};

export default adapter;
