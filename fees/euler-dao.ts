import { Adapter, FetchOptions } from "../adapters/types";
import { getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";

const curatorConfig: any = {
  [CHAIN.ETHEREUM]: {
    eulerVaultOwners: ['0xEe009FAF00CF54C1B4387829aF7A8Dc5f0c8C8C5', '0x95058F3d4C69F14f6125ad4602E925845BD5d6A4'],
    start: '2024-09-23',
  },
  [CHAIN.BASE]: {
    eulerVaultOwners: ['0x8359062798F09E277ABc6EB7D51652289176D2e9', '0x95058F3d4C69F14f6125ad4602E925845BD5d6A4'],
    start: '2024-09-23',
  },
  [CHAIN.UNICHAIN]: {
    eulerVaultOwners: ['0x3566a8b300606516De2E4576eC4132a0E13f9f66'],
    start: '2025-05-14',
  },
  [CHAIN.SWELLCHAIN]: {
    eulerVaultOwners: ['0xC798cA555e4C7e6Fa04A23e1a727c12884F40B69'],
    start: '2025-01-01',
  },
  [CHAIN.LINEA]: {
    eulerVaultOwners: ['0x624DC899774EEf1cD9c17ED10d19c9483Fa9eb0A'],
    start: '2025-10-01',
  },
  [CHAIN.ARBITRUM]: {
    eulerVaultOwners: ['0xAeE4e2E8024C1B58f4686d1CB1646a6d5755F05C'],
    start: '2025-10-01',
  },
  [CHAIN.MONAD]: {
    eulerVaultOwners: ['0x5D42F8aCd567810D57D60f90bB9C6d194207a6e1'],
    start: '2025-11-28',
  },
};

const curatorAdapter = getCuratorExport({ vaults: curatorConfig });

const fetch = async (options: FetchOptions) => {
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
  adapter: curatorConfig,
  fetch,
  deadFrom: "2026-05-06"//https://forum.euler.finance/t/sunsetting-of-dao-managed-market-and-vaults/1828
};

export default adapter;
