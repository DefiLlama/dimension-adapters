import { Adapter, FetchOptions } from "../adapters/types";
import { getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";

const EULER_DAO_SUNSET_DATE = "2026-05-06";

const k3Vaults: any = {
  [CHAIN.BSC]: {
    eulerVaultOwners: ['0x5Bb012482Fa43c44a29168C6393657130FDF0506', '0x2E28c94eE56Ac6d82600070300d86b3a14D5d71A'],
    start: '2023-10-02',
  },
  [CHAIN.AVAX]: {
    eulerVaultOwners: ['0xa4dC6C20475fDD05b248fbE51F572bD3154dd03B', '0xdD84A24eeddE63F10Ec3e928f1c8302A47538b6B'],
    start: '2023-10-02',
  },
  [CHAIN.BOB]: {
    eulerVaultOwners: ['0xDb81B93068B886172988A1A4Dd5A1523958a23f0'],
    start: '2024-08-29',
  },
  [CHAIN.PLASMA]: {
    eulerVaultOwners: ['0x060DB084bF41872861f175d83f3cb1B5566dfEA3'],
    start: '2025-10-03',
  },
  [CHAIN.ARBITRUM]: {
    eulerVaultOwners: ['0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C'],
    start: '2025-07-01',
  },
  [CHAIN.UNICHAIN]: {
    eulerVaultOwners: ['0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C'],
    start: '2025-10-01',
  },
  [CHAIN.ETHEREUM]: {
    morphoVaultOwners: ['0xdD84A24eeddE63F10Ec3e928f1c8302A47538b6B'],
    eulerVaultOwners: ['0xdD84A24eeddE63F10Ec3e928f1c8302A47538b6B'],
    start: '2025-07-01',
  },
};

//https://forum.euler.finance/t/sunsetting-of-dao-managed-market-and-vaults/1828

const eulerDaoMigratedVaults: any = {
  [CHAIN.ETHEREUM]: {
    euler: [
      '0x61aAC438453d6e3513C0c8dbb69F13860E2B5028',
      '0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1',
      '0xe0a80d35bB6618CBA260120b279d357978c42BCE',
      '0x50E6bBa3847357e5ee2Cc55Cc2F5F5E69FdaBE36',
      '0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2',
      '0x1B7712be0AB4ED3f0aFb830d26B10C50a252B82F',
      '0x797DD80692c3b2dAdabCe8e30C07fDE5307D48a9',
      '0x7c280DBDEf569e96c7919251bD2B0edF0734C5A8',
      '0xe1Ce9AF672f8854845E5474400B6ddC7AE458a10',
      '0x313603FA690301b0CaeEf8069c065862f9162162',
      '0xA28C23a459fF8773EB4dBe0e7250d93F79F1Fe2B',
      '0x20622fcD4476fbc9d5Ef36EBd371307a56d9028c',
      '0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4',
      '0xee944C7Dd107617550EC11AFCF652e14E7670A37',
      '0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6',
      '0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9',
      '0xE067311975278b7e7b81Bf57d2a9e58E3eaD75b4',
      '0x328646cdfBaD730432620d845B8F5A2f7D786C01',
      '0x2f94Bbe20ECa1e3f9332aA93A90920a0a5be0728',
      '0xe846ca062aB869b66aE8DcD811973f628BA82eAf',
    ],
    start: EULER_DAO_SUNSET_DATE,
  },
  [CHAIN.MONAD]: {
    eulerVaultOwners: ['0x5D42F8aCd567810D57D60f90bB9C6d194207a6e1'],
    start: EULER_DAO_SUNSET_DATE,
  },
  [CHAIN.ARBITRUM]: {
    eulerVaultOwners: ['0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C'],
    start: EULER_DAO_SUNSET_DATE,
  },
};

function getMergedConfig(dateString: string): any {
  const config: any = { ...k3Vaults };

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

const allChains = [...new Set([...Object.keys(k3Vaults), ...Object.keys(eulerDaoMigratedVaults)])];

const fetch = async (options: FetchOptions) => {
  const mergedConfig = getMergedConfig(options.dateString);
  const curatorAdapter = getCuratorExport({ vaults: mergedConfig });

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
  adapter: Object.fromEntries(allChains.map(chain => [chain, { start: k3Vaults[chain]?.start ?? eulerDaoMigratedVaults[chain]?.start }])),
  fetch,
};

export default adapter
