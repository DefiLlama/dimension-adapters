import * as sdk from "@defillama/sdk";
import { ChainApi } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, CONFIG_FLUID, EVENT_ABI, LIQUIDITY, parseInTopic, TOPIC0 } from "./config";
import { getVaultsT1Resolver } from './fees';

type CreateBalances = () => sdk.Balances

const liquidityResolver = async (api: ChainApi) => {
  const block = await api.getBlock();
  let address: string
  let abi: any = ABI.liquidityResolver;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      address = block < 19992056 
        ? "0x741c2Cd25f053a55fd94afF1afAEf146523E1249"
        : "0xD7588F6c99605Ab274C211a0AFeC60947668A8Cb";
      break;
  
    case CHAIN.ARBITRUM:
      address = "0x46859d33E662d4bF18eEED88f74C36256E606e44";
      break;
  
    case CHAIN.BASE:
      address = "0x35A915336e2b3349FA94c133491b915eD3D3b0cd";
      break;
  }

  return {
    listedTokens: async () => api.call({ target: address, abi: abi.listedTokens }),
  }
};

const revenueResolver = async (api: ChainApi) => {
  const block = await api.getBlock();
  let address: string
  let abi: any = ABI.revenueResolver;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      // fluid revenueResolver exist after block 19784319
      if (block >= 19784319) {
        address = block < 20138676
          ? "0x0F683159f14857D61544650607549Cdc21abE774"
          : "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      }
      break;
  
    case CHAIN.ARBITRUM:
      address = "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      break
    case CHAIN.BASE:
      address = "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      break;
  }

  return {
    targetInfo: () => { return { address, abi }},
    getRevenue: async (token: string) => api.call({ target: address, params: [token], abi: abi.getRevenue }),
  }
}

const getUncollectedLiquidities = async (api: ChainApi, tokens: string []) => {
  const revenueResolverInfo = (await revenueResolver(api)).targetInfo(); 
  return await api.multiCall({
    calls: tokens.map((token) => ({ target: revenueResolverInfo.address, params: [token] })),
    abi: revenueResolverInfo.abi.getRevenue,
  });
}

const getLiquidityRevenues = async ({ fromApi, toApi, getLogs, createBalances }: FetchOptions) => {
  const dailyValues = createBalances();
  const tokens: string[] = (await (await liquidityResolver(fromApi)).listedTokens()).map((t: string) => t.toLowerCase());

  // Fetch uncollected revenues for the "from" and "to" timestamps
  const [revenuesFrom, revenuesTo] = await Promise.all([
    getUncollectedLiquidities(fromApi, tokens),
    getUncollectedLiquidities(toApi, tokens)
  ]);

  for (const [i, token] of tokens.entries()) {
    // Default to 0 if revenues are missing
    const collectedRevenueLogs = await getLogs({ target: LIQUIDITY, onlyArgs: true, topics:[TOPIC0.logCollectRevenue, parseInTopic(token)], eventAbi: EVENT_ABI.logCollectRevenue, skipCacheRead: true })
    const collectedRevenue = collectedRevenueLogs.reduce((sum, log) => {
      const amount = log.amount ? Number(log.amount) : 0;
      return sum + amount;
    }, 0);

    const revenueTo = (revenuesTo[i] !== undefined ? Number(revenuesTo[i]) : 0) + collectedRevenue;
    const revenueFrom = revenuesFrom[i] !== undefined ? Number(revenuesFrom[i]) : 0;
    const netRevenue = Math.max(0, revenueTo - revenueFrom);

    dailyValues.add(token, netRevenue)
  }
  return dailyValues.getUSDValue();
};

const getVaultT1UncollectedRevenues = async (api: ChainApi, createBalances: CreateBalances, vaults: string [], timestamp: number) => {
  const values = createBalances()
  if (timestamp < CONFIG_FLUID[api.chain].vaultResolverExistAfterTimestamp) return values

  const vaultDatas = await ((await getVaultsT1Resolver(api)).getVaultEntireData(vaults))

  vaultDatas.forEach((data) => {
    if (!data || !data.totalSupplyAndBorrow || !data.constantVariables) return

    const { totalSupplyAndBorrow, constantVariables } = data;
    const totalSupplyVault = totalSupplyAndBorrow.totalSupplyVault;
    const totalBorrowVault = totalSupplyAndBorrow.totalBorrowVault;
    const totalSupplyLiquidity = totalSupplyAndBorrow.totalSupplyLiquidity;
    const totalBorrowLiquidity = totalSupplyAndBorrow.totalBorrowLiquidity;

    const supplyProfit = Math.max(0, totalSupplyLiquidity - totalSupplyVault);
    const borrowProfit = Math.max(0, totalBorrowVault - totalBorrowLiquidity);
    values.add(constantVariables.supplyToken, supplyProfit);
    values.add(constantVariables.borrowToken, borrowProfit);
  });

  return values;
};

const getVaultT1CollectedRevenues = async (api: ChainApi, createBalances: CreateBalances, getLogs, vaults: string []) => {
  const values = createBalances()
  const rebalanceEventLogs: any [] = await getLogs({ targets: vaults, onlyArgs: true, flatten: false, eventAbi: EVENT_ABI.logRebalance })
  if (rebalanceEventLogs.length == 0) return values;

  const contractViews = await api.multiCall({ abi: ABI.vault.constantsView, calls: vaults })
  
  rebalanceEventLogs.forEach((logs, index) => {
    logs.forEach((log: any) => {
      if(!!log) {
        const colAmt = Number(log[0])
        const debtAmt = Number(log[1])
        if (colAmt < 0) values.add(contractViews[index].supplyToken, Math.abs(colAmt))
        if (debtAmt > 0) values.add(contractViews[index].borrowToken, debtAmt)
      }
    })
  })

  return values
}

const getVaultsT1Revenues = async ({ api, fromApi, toApi, createBalances, getLogs, fromTimestamp, toTimestamp }: FetchOptions) => {
  if (toTimestamp < CONFIG_FLUID[api.chain].vaultResolverExistAfterTimestamp) return 0

  const vaults: string[] = await (await getVaultsT1Resolver(fromApi)).getAllVaultsAddresses();

  const [vaultUncollectedBalancesFrom, vaultUncollectedBalancesTo, vaultCollected] = await Promise.all([
    getVaultT1UncollectedRevenues(fromApi, createBalances, vaults, fromTimestamp),
    getVaultT1UncollectedRevenues(toApi, createBalances, vaults, toTimestamp),
    getVaultT1CollectedRevenues(api, createBalances, getLogs, vaults)
  ])

  vaultUncollectedBalancesTo.addBalances(vaultCollected)
  const revenueTo = await vaultUncollectedBalancesTo.getUSDValue()
  const revenueFrom = await vaultUncollectedBalancesFrom.getUSDValue()
  return revenueTo > revenueFrom ? revenueTo - revenueFrom : 0
}

export const getFluidDailyRevenue = async (options: FetchOptions) => {
  const [liquidityRevenues, vaultRevenues] = await Promise.all([
    getLiquidityRevenues(options),
    getVaultsT1Revenues(options)
  ])

  return liquidityRevenues + vaultRevenues
}