import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Fetches data from Lista DAO
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lending
 */

const eventContract = "0x2E2Eed557FAb1d2E11fEA1E1a23FF8f1b23551f3";

// Inner vault list for filtering
const innerVaultList = [
  "0x57134a64B7cD9F9eb72F8255A671F5Bf2fe3E2d0",
  "0xfa27f172e0b6ebcEF9c51ABf817E2cb142FbE627",
];

// Event ABIs
const vaultFeeClaimedEvent =
  "event VaultFeeClaimed(address vault, address token, uint256 assets, uint256 shares)";
const marketFeeClaimedEvent =
  "event MarketFeeClaimed(bytes32 id, address token, uint256 assets, uint256 shares)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

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
    if (innerVaultList.includes(log.vault)) {
      dailyFees.add(log.token, log.assets);
    }
  });

  //   Process market fees
  marketFeeLogs.forEach((log) => {
    dailyFees.add(log.token, log.assets);
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
