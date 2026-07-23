import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { httpGet } from "../../utils/fetchURL";

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
  const data: VaultResponse = await getConfig('lista-lending-vaults', 'https://api.lista.org/api/moolah/vault/list?page=1&pageSize=100&sort=depositsUsd&order=desc');
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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
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
    const data: ApyHistoryResponse = await httpGet(url);

    if (data.data && data.data.length > 0) {
      const dayData = data.data[0];
      const apy = parseFloat(dayData.apy);
      const totalAssetsUsd = parseFloat(dayData.totalAssetsUsd);

      const dailyInterest = (apy * totalAssetsUsd) / 365;

      dailyFees.addCGToken('usd-coin', dailyInterest, 'Borrow Interest');
      
      if (vaultInfo.ownedByDao) {
        const performanceFee = dailyInterest * (vaultInfo.fee);
        const performanceFeeToCurators = performanceFee * 0.5;
        dailyRevenue.addCGToken("usd-coin", performanceFeeToCurators, 'Performance Fees');
        dailySupplySideRevenue.addCGToken("usd-coin", performanceFeeToCurators, 'Curators Fees');
        dailySupplySideRevenue.addCGToken("usd-coin", dailyInterest - performanceFee, 'Borrow Interest To Lenders');
      } else {
        dailySupplySideRevenue.addCGToken("usd-coin", dailyInterest, 'Borrow Interest To Lenders');
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest earned by lenders from borrowers",
  Revenue: "ListaDAO Curator vaults performance fees (in basis points) charged on vault interest",
  ProtocolRevenue: "ListaDAO Curator vaults performance fees (in basis points) charged on vault interest",
  SupplySideRevenue: "Interest earned by lenders in the vaults and fees to curators",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: '2025-04-16',
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      'Borrow Interest': 'Interest earned by lenders from borrowers',
    },
    Revenue: {
      'Performance Fees': 'ListaDAO Curator vaults performance fees (in basis points) charged on vault interest',
    },
    SupplySideRevenue: {
      'Curators Fees': 'Performance fees paid to vaults curators.',
      'Borrow Interest To Lenders': 'Interest earned by lenders in the vaults',
    },
  }
};

export default adapter;
