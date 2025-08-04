import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

/**
 * Fetches data from Lista DAO
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lending
 * Specify time by put it at the end of the command (in seconds)
 */

const eventContract = "0x2E2Eed557FAb1d2E11fEA1E1a23FF8f1b23551f3";

interface VaultResponse {
  code: string;
  msg: string;
  data: {
    total: number;
    list: Array<{
      address: string;
      curator: string;
    }>;
  };
}

// Inner vault list from API
const getInnerVaultList = async (): Promise<string[]> => {
  const { data } = await axios.get<VaultResponse>(
    "https://api.lista.org/api/moolah/vault/list?page=1&pageSize=100&sort=depositsUsd&order=desc"
  );
  return data.data.list
    .filter(
      (vault) => vault.curator.toLowerCase().replace(/\s/g, "") === "listadao"
    )
    .map((vault) => vault.address.toLowerCase());
};

// Event ABIs
const vaultFeeClaimedEvent =
  "event VaultFeeClaimed(address vault, address token, uint256 assets, uint256 shares)";
const marketFeeClaimedEvent =
  "event MarketFeeClaimed(bytes32 id, address token, uint256 assets, uint256 shares)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const innerVaultList = await getInnerVaultList();

  // Get VaultFeeClaimed events
  const vaultFeeLogs = await options.getLogs({
    target: eventContract,
    eventAbi: vaultFeeClaimedEvent,
  });

  //   Get MarketFeeClaimed events
  const marketFeeLogs = await options.getLogs({
    target: eventContract,
    eventAbi: marketFeeClaimedEvent,
  });

  // Process vault fees - only for specified inner vaults
  vaultFeeLogs.forEach((log) => {
    if (!innerVaultList.includes(log.vault.toLowerCase())) return;
    dailyFees.add(log.token, log.assets);
  });

  //   Process market fees
  marketFeeLogs.forEach((log) => dailyFees.add(log.token, log.assets));

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
