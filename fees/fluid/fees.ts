import { ChainApi } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, EVENT_ABI, LIQUIDITY } from "./config";

const reserveContract = "0x264786EF916af64a1DB19F513F24a3681734ce92"

export const getVaultsResolver = async (api: ChainApi) => {
  const block = await api.getBlock()
  let address: string
  let abi: any = ABI.vaultResolver_after_19992222

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      if (block < 19313700) {
        // vault resolver related revenue only exists after this block. revenue / fees before are negligible
        break
      }
  
      if (block < 19662786) {
        address = "0x8DD65DaDb217f73A94Efb903EB2dc7B49D97ECca";
        abi = ABI.vaultResolver_before_19992222;
      } else if (block < 19992222) {
        address = "0x93CAB6529aD849b2583EBAe32D13817A2F38cEb4";
        abi = ABI.vaultResolver_before_19992222;
      } else if (block < 20983000) {
        address = "0x56ddF84B2c94BF3361862FcEdB704C382dc4cd32";
      } else {
        address = "0x6922b85D6a7077BE56C0Ae8Cab97Ba3dc4d2E7fA"; // VaultT1Resolver compatibility
      }
      break;
  
    case CHAIN.ARBITRUM:
      address = "0x77648D39be25a1422467060e11E5b979463bEA3d";
      break;
  
    case CHAIN.BASE:
      address = "0x94695A9d0429aD5eFec0106a467aDEaDf71762F9";
      break;
  }

  return {
    getAllVaultsAddresses: async () => api.call({ target: address, abi: abi.getAllVaultsAddresses }),
    getVaultEntireData: async (vaults: string []) => api.multiCall({ calls: vaults.map((vault) => ({ target: address, params: [vault] })), abi: abi.getVaultEntireData, permitFailure: true })
  }
}

const parseInTopic = (address: string): string => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error('Invalid EVM address');
  }
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
}

export const getFluidDailyFees = async ({ api, fromApi, toApi, getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();
  const vaults: string[] = await (await getVaultsResolver(api)).getAllVaultsAddresses();

  const [vaultDatasFrom, vaultDatasTo, vaultBorrowDatas] = await Promise.all([
    (await getVaultsResolver(fromApi)).getVaultEntireData(vaults),
    (await getVaultsResolver(toApi)).getVaultEntireData(vaults),
    toApi.multiCall({ calls: vaults, abi: ABI.vault.constantsView })
  ])

  for (const [i, vault] of vaults.entries()) {
    const vaultDataFrom = vaultDatasFrom[i];
    const vaultDataTo = vaultDatasTo[i];
    const borrowData = vaultBorrowDatas[i];
    // Skip the current vault if any required data is missing
    if (!vaultDataFrom || !vaultDataTo || !borrowData) continue;

    const vaultFrom = vaultDataFrom.vault
    const vaultTo = vaultDataTo.vault

    if (!vaultFrom || !vaultTo || vaultFrom !== vault || vaultTo !== vault) continue

    const { borrowToken } = borrowData;
    const { totalSupplyAndBorrow: totalSupplyAndBorrowFrom } = vaultDataFrom;
    const { totalSupplyAndBorrow: totalSupplyAndBorrowTo } = vaultDataTo;

    if (!borrowToken) continue;

    const initialBalance = Number(totalSupplyAndBorrowFrom.totalBorrowVault);
    const borrowBalanceTo = Number(totalSupplyAndBorrowTo.totalBorrowVault);

    const liquidityLogs = await getLogs({ target: LIQUIDITY, onlyArgs: true, topics: ['0x4d93b232a24e82b284ced7461bf4deacffe66759d5c24513e6f29e571ad78d15', parseInTopic(vault), parseInTopic(borrowToken)], eventAbi: EVENT_ABI.logOperate, flatten: true, skipCacheRead: true });
    
    const borrowBalances = liquidityLogs
      .filter((log) => log[5] !== reserveContract)
      .reduce((balance, [, , , amount]) => balance + Number(amount) , initialBalance)
    
    const fees = borrowBalanceTo > borrowBalances ? borrowBalanceTo - borrowBalances : 0n
    dailyFees.add(borrowToken, fees)
  }

  return dailyFees;
};