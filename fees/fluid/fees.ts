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
    getVaultEntireData: async (vaults: string []) => api.multiCall({ calls: vaults.map((vault) => ({ target: address, params: [vault] })), abi: abi.getVaultEntireData })
  }
}

export const getFluidDailyFees = async ({ api, fromApi, toApi, getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();
  const liquidityLogs = await getLogs({ target: LIQUIDITY, onlyArgs: true, eventAbi: EVENT_ABI.logOperate });
  const vaults: string[] = await (await getVaultsResolver(api)).getAllVaultsAddresses();

  if (!liquidityLogs.length) return dailyFees

  const [vaultDatasFrom, vaultDatasTo, vaultBorrowDatas] = await Promise.all([
    (await getVaultsResolver(fromApi)).getVaultEntireData(vaults),
    (await getVaultsResolver(toApi)).getVaultEntireData(vaults),
    toApi.multiCall({ calls: vaults, abi: ABI.vault.constantsView })
  ])

  vaults.map((vault, i) => {
    const vaultDataFrom = vaultDatasFrom[i];
    const vaultDataTo = vaultDatasTo[i];
    const borrowData = vaultBorrowDatas[i];
    // Skip the current vault if any required data is missing
    if (!vaultDataFrom || !vaultDataTo || !borrowData) return;

    const vaultFrom = vaultDataFrom.vault
    const vaultTo = vaultDataTo.vault

    if (!vaultFrom || !vaultTo || vaultFrom !== vault || vaultTo !== vault) return

    const { borrowToken } = borrowData;
    const { totalSupplyAndBorrow: totalSupplyAndBorrowFrom } = vaultDataFrom;
    const { totalSupplyAndBorrow: totalSupplyAndBorrowTo } = vaultDataTo;

    if (!borrowToken) return;

    const initialBalance = BigInt(totalSupplyAndBorrowFrom.totalBorrowVault);
    const borrowBalanceTo = BigInt(totalSupplyAndBorrowTo.totalBorrowVault);

    const vaultOperates = [...liquidityLogs
      .filter(([vaultOperate, tokenUsed, , , , receiver]) =>
        vaultOperate === vault && tokenUsed === borrowToken && receiver !== reserveContract
      )
      .reduce((uniqueLogs, log) => {
        const logKey = `${log[0]}_${log[1]}_${log[2]}_${log[3]}_${log[4]}_${log[5]}_${log[6]}_${log[7]}`;
        if (!uniqueLogs.has(logKey)) {
          uniqueLogs.set(logKey, log);
        }
        return uniqueLogs;
      }, new Map())
      .values()];
    
    const borrowBalance = vaultOperates.reduce(
      (balance, [, , , amount]) => balance + BigInt(amount),
      initialBalance
    );

    const fees = borrowBalanceTo > borrowBalance ? borrowBalanceTo - borrowBalance : 0n;
    dailyFees.add(borrowToken, fees);
  });

  return dailyFees;
};