import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

/**
 * Fetches data from Lista DAO
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lending
 * Specify time by put it at the end of the command (in seconds)
 */

// const eventContract = "0x2E2Eed557FAb1d2E11fEA1E1a23FF8f1b23551f3";

interface VaultResponse {
  code: string;
  msg: string;
  data: {
    total: number;
    list: Array<{
      address: string;
      curator: string;
      fee: number;
    }>;
  };
}

interface VaultInfo {
  address: string;
  fee: number;
  ownedByDao: boolean;
}

interface ApyHistoryResponse {
  code: string;
  msg: string;
  data: Array<{
    chartTime: number;
    apy: string;
    emissionApy: string;
    totalAssets: string;
    totalAssetsUsd: string;
  }>;
}

const getVaultInfo = async (): Promise<VaultInfo[]> => {
  const { data } = await axios.get<VaultResponse>(
    "https://api.lista.org/api/moolah/vault/list?page=1&pageSize=100&sort=depositsUsd&order=desc"
  );

  return data.data.list.map((vault) => ({
    address: vault.address.toLowerCase(),
    fee: vault.fee,
    ownedByDao: vault.curator.toLowerCase().replace(/\s/g, "") === "listadao",
  }));
};

// // Event ABIs
// const vaultFeeClaimedEvent =
//   "event VaultFeeClaimed(address vault, address token, uint256 assets, uint256 shares)";
// const marketFeeClaimedEvent =
//   "event MarketFeeClaimed(bytes32 id, address token, uint256 assets, uint256 shares)";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const vaultInfoList = await getVaultInfo();

  // // Get VaultFeeClaimed events
  // const vaultFeeLogs = await options.getLogs({
  //   target: eventContract,
  //   eventAbi: vaultFeeClaimedEvent,
  // });

  // // Get MarketFeeClaimed events
  // const marketFeeLogs = await options.getLogs({
  //   target: eventContract,
  //   eventAbi: marketFeeClaimedEvent,
  // });

  // // Process vault fees (performance fees) - only for ListaDAO curator vaults
  // vaultFeeLogs.forEach((log) => {
  //   const vaultInfo = vaultInfoList.find(v => v.address === log.vault.toLowerCase());
  //   if (!vaultInfo?.ownedByDao) return;
  //   dailyRevenue.add(log.token, log.assets);
  // });

  // // Process market fees
  // marketFeeLogs.forEach((log) => dailyRevenue.add(log.token, log.assets));

  // Calculate supply side revenue and protocol revenue from APY history
  for (const vaultInfo of vaultInfoList) {
    const url = `https://api.lista.org/api/moolah/vault/apy/history?address=${vaultInfo.address}&startTime=${options.startTimestamp}&endTime=${options.endTimestamp}`;
    const { data } = await axios.get<ApyHistoryResponse>(url);

    if (data.data && data.data.length > 0) {
      const dayData = data.data[0];
      const apy = parseFloat(dayData.apy);
      const totalAssetsUsd = parseFloat(dayData.totalAssetsUsd);

      const dailyInterest = (apy * totalAssetsUsd) / 365;
      dailySupplySideRevenue.addCGToken("usd-coin", dailyInterest);

      if (vaultInfo.ownedByDao) {
        const performanceFee = dailyInterest * (vaultInfo.fee);
        dailyRevenue.addCGToken("usd-coin", performanceFee);
      }
    }
  }
  const dailyFees = dailyRevenue.clone(0.05);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees: dailySupplySideRevenue,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest earned by lenders from borrowers",
  Revenue: "ListaDAO Curator vaults performance fees (in basis points) charged on vault interest",
  SupplySideRevenue: "Interest earned by lenders in the vaults",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2025-04-16',
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
