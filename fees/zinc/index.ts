import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceivedDune } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

const TREASURY = "4Ucw8BNkLWBu6gxkQsw3BRG2qRtw5WrG1UxiKpQjScH5";
const BUYBACK_SOL_VAULT = "8nEo7GArDc3aVDuHoiDYJoVUNLtzgYaVmGGNvxELCZJc";
const STOCKPILE_SOL_VAULT = "8RxMJD7BtdzxuZkmDqcxhR6gWvegLJ1GNf9NFrPkCmwf";

const ZINC_ADDRESS = "zinc155BS4mSPk8GXQj4R5hkVDQXcW253pTYq5SGyfi";

// Native SOL balances return $0. Convert them to 
// WSOL so they're priced correctly.
const NATIVE_SOL_KEY = "solana:So11111111111111111111111111111111111111111";
const convertSOLBalanceToWSOL = (b: any) => {
  const native = b._balances?.[NATIVE_SOL_KEY];
  if (native) {
    b.add(ADDRESSES.solana.SOL, native);
    delete b._balances[NATIVE_SOL_KEY];
  }
};

const fetch = async (options: FetchOptions) => {
  const treasuryFlows  = await getSolanaReceivedDune({ options, targets: [TREASURY], blacklist_mints: [ZINC_ADDRESS] });
  const buybackFlows   = await getSolanaReceivedDune({ options, targets: [BUYBACK_SOL_VAULT], blacklist_mints: [ZINC_ADDRESS] });
  const stockpileFlows = await getSolanaReceivedDune({ options, targets: [STOCKPILE_SOL_VAULT], blacklist_mints: [ZINC_ADDRESS] });

  convertSOLBalanceToWSOL(treasuryFlows);
  convertSOLBalanceToWSOL(buybackFlows);
  convertSOLBalanceToWSOL(stockpileFlows);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(treasuryFlows,  METRIC.PROTOCOL_FEES);
  dailyFees.addBalances(buybackFlows,   METRIC.TOKEN_BUY_BACK);
  dailyFees.addBalances(stockpileFlows, "Stockpile Prize Pool");

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(treasuryFlows, METRIC.PROTOCOL_FEES);

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addBalances(buybackFlows, METRIC.TOKEN_BUY_BACK);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(stockpileFlows, "Stockpile Prize Pool");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "SOL paid by players when participating in ZINC rounds.",
  UserFees: "SOL paid by players when participating in ZINC rounds.",
  Revenue: "SOL retained by the ZINC treasury.",
  ProtocolRevenue: "SOL retained by the ZINC treasury.",
  HoldersRevenue: "SOL accumulated in the buyback vault, later converted to ZINC and distributed to stakers/burned, on a 10/90 ratio.",
  SupplySideRevenue: "SOL accumulated in the stockpile vault and paid out to stockpile winners.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "SOL inflows into the ZINC treasury.",
    [METRIC.TOKEN_BUY_BACK]: "SOL inflows into the buyback vault.",
    "Stockpile Prize Pool": "SOL inflows into the stockpile vault.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "SOL inflows into the ZINC treasury.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "SOL inflows into the ZINC treasury.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "SOL inflows into the buyback vault, later converted to ZINC and distributed to stakers/burned, on a 10/90 ratio.",
  },
  SupplySideRevenue: {
    "Stockpile Prize Pool": "SOL inflows into the stockpile vault, paid out to stockpile winners.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2026-05-26",
  methodology,
  breakdownMethodology,
};

export default adapter;
