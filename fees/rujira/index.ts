import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchRujiraDailyFees, RUJIRA_START_DATE } from "../../helpers/rujira";

const FIN = "Rujira Trade (FIN)";
const FIN_TO_RUJIRA = "FIN Fees To Rujira";
const FIN_TO_THORCHAIN = "FIN Fees To THORChain";
const SWAP_AFFILIATE_FEES = "RUJI Swap Affiliate Fees";
const BRUNE = "bRUNE";
const BRUNE_PROTOCOL_FEE = "bRUNE Protocol Fee";
const BRUNE_USER_REWARDS = "bRUNE Rewards To Users";
const RUJI_STAKER_REVENUE = "Revenue To RUJI Stakers";
const RUJIRA_POL_REVENUE = "Revenue To Rujira POL";

function addUsd(balance: ReturnType<FetchOptions["createBalances"]>, value: number, label: string) {
  if (value) balance.addUSDValue(value, label);
}

const fetch = async (options: FetchOptions) => {
  const data = await fetchRujiraDailyFees(options.startOfDay);
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  addUsd(dailyFees, data.finGrossFeesUsd, FIN);
  addUsd(dailyUserFees, data.finGrossFeesUsd, FIN);
  addUsd(dailyRevenue, data.finRujiraRevenueUsd, FIN_TO_RUJIRA);
  addUsd(dailySupplySideRevenue, data.finThorchainRevenueUsd, FIN_TO_THORCHAIN);

  addUsd(dailyFees, data.swapAffiliateFeesUsd, SWAP_AFFILIATE_FEES);
  addUsd(dailyUserFees, data.swapAffiliateFeesUsd, SWAP_AFFILIATE_FEES);
  addUsd(dailyRevenue, data.swapAffiliateFeesUsd, SWAP_AFFILIATE_FEES);

  addUsd(dailyFees, data.bruneGrossRewardsUsd, BRUNE);
  addUsd(dailyRevenue, data.bruneProtocolFeeUsd, BRUNE_PROTOCOL_FEE);
  addUsd(dailyProtocolRevenue, data.bruneProtocolFeeUsd, BRUNE_PROTOCOL_FEE);
  addUsd(dailySupplySideRevenue, data.bruneStakerRewardsUsd, BRUNE_USER_REWARDS);

  addUsd(dailyHoldersRevenue, data.rujiHoldersRevenueUsd, RUJI_STAKER_REVENUE);
  addUsd(dailyProtocolRevenue, data.rujiProtocolRevenueUsd, RUJIRA_POL_REVENUE);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.THORCHAIN],
  start: RUJIRA_START_DATE,
  fetch,
  methodology: {
    Fees: "FIN app-layer fees, the 0.50% RUJI Swap affiliate fee, and gross THORChain bonding rewards earned by bRUNE.",
    Revenue: "The Rujira share of FIN fees, the full RUJI Swap affiliate fee, and the 10% bRUNE protocol commission.",
    ProtocolRevenue: "Realized Rujira revenue routed to protocol-owned liquidity.",
    HoldersRevenue: "Realized revenue distributed to RUJI stakers.",
    SupplySideRevenue: "The FIN fee share paid to THORChain and the 90% of bRUNE bonding rewards distributed to bRUNE users.",
  },
  breakdownMethodology: {
    Fees: {
      [FIN]: "All FIN app-layer fees, including the CCL maker-fee component.",
      [SWAP_AFFILIATE_FEES]: "The additional 0.50% RUJI affiliate fee, excluding gas and THORChain liquidity fees.",
      [BRUNE]: "Gross THORChain bonding rewards earned by RUNE bonded through bRUNE.",
    },
    Revenue: {
      [FIN_TO_RUJIRA]: "The Rujira destination amount from FIN fees.",
      [SWAP_AFFILIATE_FEES]: "The RUJI Swap affiliate fee retained as Rujira revenue.",
      [BRUNE_PROTOCOL_FEE]: "The 10% Rujira commission on bRUNE bonding rewards.",
    },
    ProtocolRevenue: {
      [BRUNE_PROTOCOL_FEE]: "The 10% Rujira commission on bRUNE bonding rewards.",
      [RUJIRA_POL_REVENUE]: "Realized Rujira revenue sent to protocol-owned liquidity.",
    },
    HoldersRevenue: {
      [RUJI_STAKER_REVENUE]: "Realized revenue distributed by the RUJI staking pool.",
    },
    SupplySideRevenue: {
      [FIN_TO_THORCHAIN]: "The THORChain destination amount from FIN fees.",
      [BRUNE_USER_REWARDS]: "The 90% of bRUNE bonding rewards distributed to bRUNE users.",
    },
  },
};

export default adapter;
