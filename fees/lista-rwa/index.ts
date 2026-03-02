import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

/**
 * Lista DAO RWA fees: RWAEarnPool (ClaimWithdrawal) + RWAAdapter (WithdrawFromVault feeAmount)
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-rwa
 */

const USDT = ADDRESSES.bsc.USDT;
const FEE_CLAIMER = "0x2E2Eed557FAb1d2E11fEA1E1a23FF8f1b23551f3";

const CLAIM_WITHDRAWAL_ABI =
  "event ClaimWithdrawal(address user, uint256 idx, uint256 amount)";
const WITHDRAW_FROM_VAULT_ABI =
  "event WithdrawFromVault(uint256 shares, uint256 totalAmount, uint256 feeAmount)";

const EARN_POOLS = [
  "0x60512AeB641E960faAac7E2bFcB1819f993E7282", // USDT.Treasury
  "0x82664f43676FfD81BE2b472c5A2E2808952ecd56", // USDT.AAA
];
const ADAPTERS = [
  "0xC1AeEBBfD8b1280e78D930C43700758F543F5Fc6", // USDT.Treasury
  "0x69D15B7a232244EB0FDDED2a3E038589E5C50105", // USDT.AAA
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const claimLogs = await options.getLogs({
    targets: EARN_POOLS,
    eventAbi: CLAIM_WITHDRAWAL_ABI,
  });
  claimLogs.forEach((log) => {
    if (log.user.toLowerCase() === FEE_CLAIMER.toLowerCase()) {
      dailyFees.add(USDT, log.amount);
    }
  });

  const vaultLogs = await options.getLogs({
    targets: ADAPTERS,
    eventAbi: WITHDRAW_FROM_VAULT_ABI,
  });
  vaultLogs.forEach((log) => {
    if (log.feeAmount > 0n) {
      dailyFees.add(USDT, log.feeAmount);
    }
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-04-16",
    },
  },
};

export default adapter;
