import * as sdk from "@defillama/sdk";
import { ChainApi } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, CONFIG_FLUID, EVENT_ABI, LIQUIDITY } from "./config";
import { getVaultsResolver } from './fees';

type CreateBalances = () => sdk.Balances
const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

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
    getExchangePricesAndConfig: async (tokens: string []) => api.multiCall({ calls: tokens.map((token) => ({ target: address, params: [token] })), abi: abi.getExchangePricesAndConfig }),
    getTotalAmounts: async (tokens: string []) =>  api.multiCall({ calls: tokens.map((token) => ({ target: address, params: [token] })), abi: abi.getTotalAmounts })
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
    calcRevenueSimulatedTime: async (totalAmounts: string, exchangePricesAndConfig: string, liquidityTokenBalance: string, timestamp: number) => await api.call({ target: address, params: [totalAmounts, exchangePricesAndConfig, liquidityTokenBalance, timestamp], abi: abi.calcRevenueSimulatedTime, permitFailure: true })
  }
}

const getUncollectedLiquidities = async (api: ChainApi, timestamp: number, tokens: string []) => {
  const [totalAmounts, exchangePricesAndConfig] = await Promise.all([
    (await liquidityResolver(api)).getTotalAmounts(tokens),
    (await liquidityResolver(api)).getExchangePricesAndConfig(tokens),
  ]);

  const liquidityTokenBalance: string[] = await api.multiCall({
    calls: tokens.filter((token) => token !== NATIVE_TOKEN).map((token) => ({ target: token, params: [LIQUIDITY] })),
    abi: "erc20:balanceOf",
  });

  if (tokens.includes(NATIVE_TOKEN)) {
    const { output: nativeBalance } = (await sdk.api.eth.getBalance({ target: LIQUIDITY, chain: api.chain, block: await api.getBlock() }))
    const eeIndex = tokens.indexOf(NATIVE_TOKEN);
    liquidityTokenBalance.splice(eeIndex, 0, nativeBalance);
  }

  return Promise.all(
    tokens.map(async (_, index) => {
      const totalAmount = totalAmounts[index];
      const exchangePriceConfig = exchangePricesAndConfig[index];
      const tokenBalance = liquidityTokenBalance[index];
  
      if (totalAmount === undefined || exchangePriceConfig === undefined || tokenBalance === undefined) return 0;
  
      const _uncollectedRevenue = await (await revenueResolver(api)).calcRevenueSimulatedTime(
        totalAmount,
        exchangePriceConfig,
        tokenBalance,
        timestamp
      );
  
      return _uncollectedRevenue ?? 0;
    })
  );
}

const getLiquidityRevenues = async ({ api, fromApi, toApi, getLogs, createBalances, fromTimestamp, toTimestamp }: FetchOptions, fromBlock: number, toBlock: number) => {
  const dailyValues = createBalances();
  const collectedLiquidityLogs = await getLogs({ target: LIQUIDITY, eventAbi: EVENT_ABI.logCollectRevenue });
  const tokens: string[] = (await (await liquidityResolver(api)).listedTokens()).map((t: string) => t.toLowerCase());
  
  // Fetch uncollected revenues for the "from" and "to" timestamps
  const [revenuesFrom, revenuesTo] = await Promise.all([
    getUncollectedLiquidities(fromApi, fromTimestamp, tokens),
    getUncollectedLiquidities(toApi, toTimestamp, tokens)
  ]);

  tokens.forEach((token, i) => {
    // Default to 0 if revenues are missing
    const collectedRevenue = collectedLiquidityLogs
      .filter(([logToken]) => logToken.toLowerCase() === token)
      .reduce((sum, [, amount]) => sum + (amount ? Number(amount) : 0), 0);

    const revenueTo = (revenuesTo[i] !== undefined ? Number(revenuesTo[i]) : 0) + collectedRevenue;
    const revenueFrom = revenuesFrom[i] !== undefined ? Number(revenuesFrom[i]) : 0;
    const netRevenue = Math.max(0, revenueTo - revenueFrom);

    dailyValues.add(token, netRevenue);
  });

  return dailyValues.getUSDValue();
};

const getVaultUncollectedRevenues = async (api: ChainApi, createBalances: CreateBalances, vaults: string [], timestamp: number) => {
  const values = createBalances()
  if (timestamp < CONFIG_FLUID[api.chain].vaultResolverExistAfterTimestamp) return values

  const vaultDatas = await ((await getVaultsResolver(api)).getVaultEntireData(vaults))

  vaultDatas.forEach((data, index) => {
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

const getVaultCollectedRevenues = async (api: ChainApi, createBalances: CreateBalances, getLogs, vaults: string [], fromBlock: number, toBlock: number) => {
  const values = createBalances()
  const rebalanceEventLogs: any [] = await getLogs({ fromBlock, toBlock, targets: vaults, onlyArgs: true, flatten: false, eventAbi: EVENT_ABI.logRebalance})
  
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

const getVaultsRevenues = async ({ api, fromApi, toApi, createBalances, getLogs, fromTimestamp, toTimestamp }: FetchOptions, fromBlock: number, toBlock: number) => {
  if (toTimestamp < CONFIG_FLUID[api.chain].vaultResolverExistAfterTimestamp) return 0

  const vaults: string[] = await (await getVaultsResolver(api)).getAllVaultsAddresses();

  const [vaultUncollectedBalancesFrom, vaultUncollectedBalancesTo, vaultCollected] = await Promise.all([
    getVaultUncollectedRevenues(fromApi, createBalances, vaults, fromTimestamp),
    getVaultUncollectedRevenues(toApi, createBalances, vaults, toTimestamp),
    getVaultCollectedRevenues(api, createBalances, getLogs, vaults, fromBlock, toBlock)
  ])

  vaultUncollectedBalancesTo.addBalances(vaultCollected)
  const revenueTo = await vaultUncollectedBalancesTo.getUSDValue()
  const revenueFrom = await vaultUncollectedBalancesFrom.getUSDValue()
  return revenueTo > revenueFrom ? revenueTo - revenueFrom : 0
}

export const getFluidDailyRevenue = async (options: FetchOptions, fromBlock: number, toBlock: number) => {
  const [liquidityRevenues, vaultRevenues] = await Promise.all([
    getLiquidityRevenues(options, fromBlock, toBlock),
    getVaultsRevenues(options, fromBlock, toBlock)
  ])
  
  return liquidityRevenues + vaultRevenues
}