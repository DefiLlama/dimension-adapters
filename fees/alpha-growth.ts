import { Adapter, FetchOptions } from "../adapters/types";
import { getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";

const EULER_DAO_SUNSET_DATE = "2026-05-06";

const alphaGrowthVaults: any = {
  [CHAIN.UNICHAIN]: {
    eulerVaultOwners: ['0x8d9fF30f8ecBA197fE9492A0fD92310D75d352B9'],
  },
};

//https://forum.euler.finance/t/sunsetting-of-dao-managed-market-and-vaults/1828
const eulerDaoMigratedVaults: any = {
  [CHAIN.ETHEREUM]: {
    euler: [
      '0xe47BABACfc9Ce5F85126fab7C7E211DA077d820E',
      '0x481D4909D7ca2eb27c4975f08dCE07DBeF0d3Fa7',
      '0x1F46186AF85A967416b17380800c69860B7C516F',
      '0x2a356443FeE07703266066c6Bb1B11b82d8246AD',
      '0x49d9fd20f1d61648Fa9434a8c0C33174F5614eB8',
      '0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE',
      '0x46BC453666BA11b4b08B0804E49A9D797546ee7D',
      '0x3573A84Bee11D49A1CbCe2b291538dE7a7dD81c6',
      '0xFBCc21fedd4C4e9097Ef1Baa65B7Ad386b59512D'
    ],
    start: EULER_DAO_SUNSET_DATE,
  },
  [CHAIN.BASE]: {
    eulerVaultOwners: ['0x8359062798F09E277ABc6EB7D51652289176D2e9', '0x95058F3d4C69F14f6125ad4602E925845BD5d6A4'],
    start: EULER_DAO_SUNSET_DATE,
  },
  [CHAIN.UNICHAIN]: {
    eulerVaultOwners: ['0x3566a8b300606516De2E4576eC4132a0E13f9f66'],
    start: EULER_DAO_SUNSET_DATE,
  },
  [CHAIN.LINEA]: {
    eulerVaultOwners: ['0x624DC899774EEf1cD9c17ED10d19c9483Fa9eb0A'],
    start: EULER_DAO_SUNSET_DATE,
  },
};

function getMergedConfig(dateString: string): any {
  const config: any = { ...alphaGrowthVaults };
  
  if (dateString >= EULER_DAO_SUNSET_DATE) {
    for (const [chain, vaultConfig] of Object.entries(eulerDaoMigratedVaults) as [string, any][]) {
      if (!config[chain]) {
        config[chain] = { eulerVaultOwners: [], euler: [] };
      }
      if (vaultConfig.eulerVaultOwners) {
        config[chain].eulerVaultOwners = [
          ...(config[chain].eulerVaultOwners || []),
          ...vaultConfig.eulerVaultOwners,
        ];
      }
      if (vaultConfig.euler) {
        config[chain].euler = [
          ...(config[chain].euler || []),
          ...vaultConfig.euler,
        ];
      }
    }
  }
  
  return config;
}

const allChains = [...new Set([...Object.keys(alphaGrowthVaults), ...Object.keys(eulerDaoMigratedVaults)])];

const fetch = async (options: FetchOptions) => {
  const mergedConfig = getMergedConfig(options.dateString);
  const curatorAdapter = getCuratorExport({ vaults: mergedConfig });
  
  if (!(curatorAdapter.adapter as any)[options.chain]) {
    return { dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue: 0, dailySupplySideRevenue: 0 };
  }
  
  const result = await (curatorAdapter.adapter as any)[options.chain].fetch(options);

  return {
    dailyFees: result.dailyFees,
    dailyRevenue: result.dailyRevenue,
    dailyProtocolRevenue: result.dailyRevenue,
    dailySupplySideRevenue: result.dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(allChains.map(chain => [chain, { start: alphaGrowthVaults[chain]?.start ?? eulerDaoMigratedVaults[chain]?.start }])),
  fetch,
};

export default adapter;
