import * as sdk from "@defillama/sdk";
import { getTimestamp } from "@defillama/sdk/build/util";
import { ChainApi } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, CONFIG_FLUID, EVENT_ABI, LIQUIDITY, parseInTopic, TOPIC0 } from "./config";
import { getVaultsT1Resolver } from './fees';
import { getBlock } from "@defillama/sdk/build/util/blocks";

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
    // getExchangePricesAndConfig: async (tokens: string []) => {
    //   try {
    //     return await api.multiCall({ calls: tokens.map((token) => ({ target: address, params: [token] })), abi: abi.getExchangePricesAndConfig });
    //   } catch (error) {

    //     // console.error("Error fetching exchange prices and config:");
    //     // console.log(`Current block: ${await api.getBlock()}`);
    //     // console.log(`Tokens: ${tokens.map((token) => ({ target: address, params: [token] }))}`);
    //     throw error;
    //   }
    // },
    // getTotalAmounts: async (tokens: string []) => {
    //   try {
    //     return await api.multiCall({ calls: tokens.map((token) => ({ target: address, params: [token] })), abi: abi.getTotalAmounts });
    //   } catch (error) {
    //     // console.error("Error fetching total amounts:");
    //     // console.log(`Current block: ${await api.getBlock()}`);
    //     // console.log(`Tokens: ${tokens.map((token) => ({ target: address, params: [token] }))}`);
    //     throw error;
    //   }
    // }
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
    targetInfo: () => { return { address, abi} },
    // calcRevenueSimulatedTime: async (totalAmounts: string, exchangePricesAndConfig: string, liquidityTokenBalance: string, timestamp: number) => {
    //   const blockTimestamp = await getTimestamp(await api.getBlock(), api.chain);
    //   if(blockTimestamp > timestamp) {
    //     // calcRevenueSimulatedTime() method does not support the case where lastUpdateTimestamp (included in exchangePricesAndConfig) is > simulated block.timestamp ("timestamp"). 
    //     // making the timestamp at least be block.timestamp guarantees that this can never be the case, as `exchangePricesAndConfig` is fetched at that block.timestamp.
    //     // difference here should be very negligible (yield accrual for time difference), although advanced handling would be possible if needed via checking the actual time
    //     // difference and processing further accordingly.
    //     // console.log("adjusted timestamp from ",timestamp, "to", blockTimestamp)
    //     timestamp = blockTimestamp;
    //   }
    //   return await api.call({ target: address, params: [totalAmounts, exchangePricesAndConfig, liquidityTokenBalance, timestamp], abi: abi.calcRevenueSimulatedTime });
    // },
    getRevenue: async (token: string) => api.call({ target: address, params: [token], abi: abi.getRevenue }),
  }
}

const getUncollectedLiquidities = async (api: ChainApi, timestamp: number, tokens: string []) => {
  const revenueResolverInfo = (await revenueResolver(api)).targetInfo(); 
  return await api.multiCall({
    calls: tokens.map((token) => ({ target: revenueResolverInfo.address, params: [token] })),
    abi: revenueResolverInfo.abi.getRevenue,
  });
  // await (await revenueResolver(api)).getRevenue(
  //   token
  // ); 

  // // const [totalAmounts, exchangePricesAndConfig] = await Promise.all([
  // //   (await liquidityResolver(api)).getTotalAmounts(tokens),
  // //   (await liquidityResolver(api)).getExchangePricesAndConfig(tokens),
  // // ]);

  // let liquidityTokenBalance: string[];
  // try {
  //   liquidityTokenBalance = await api.multiCall({
  //     calls: tokens.filter((token) => token !== NATIVE_TOKEN).map((token) => ({ target: token, params: [LIQUIDITY] })),
  //     abi: "erc20:balanceOf",
  //   });
  // } catch (error) {
  //   // console.log("Error fetching liquidity token balance:", error);
  //   // console.log("get balances for tokens", tokens.filter((token) => token !== NATIVE_TOKEN));
  //   throw error;
  // }

  // // console.log("tokens", tokens)
  // // console.log("liquidityTokenBalance", liquidityTokenBalance)
  // // console.log("totalAmounts", totalAmounts)
  // // console.log("exchangePricesAndConfig", exchangePricesAndConfig)

  // const blockTimestamp = await getTimestamp(await api.getBlock(), api.chain);

  // if (tokens.includes(NATIVE_TOKEN)) {
  //   const { output: nativeBalance } = (await sdk.api.eth.getBalance({ target: LIQUIDITY, chain: api.chain, block: await api.getBlock() }))
  //   const ethBalance = (await api.provider.getBalance(LIQUIDITY, await api.getBlock())).toString();

  //   const block = (await getBlock(api.chain, timestamp)).number;
  //   // console.log("block via timestamp", block);
  //   // console.log("block via api.block", api.block);
  //   // console.log("block from api", await api.getBlock());
  //   const ethBalance2 = (await api.provider.getBalance(LIQUIDITY, block)).toString();
  //   // console.log(nativeBalance, "nativeBalance");
  //   // console.log(ethBalance, "ethBalance");
  //   // console.log(ethBalance2, "ethBalance2");
  //   // console.log("block from api provider", await api.provider.getBlockNumber());
  //   //
  //   const eeIndex = tokens.indexOf(NATIVE_TOKEN);
  //   liquidityTokenBalance.splice(eeIndex, 0, nativeBalance);
  // }
  // // console.log("liquidityTokenBalance after", liquidityTokenBalance)

  // return Promise.all(
  //   tokens.map(async (token, index) => {
  //     // let totalAmount = totalAmounts[index];
  //     // const exchangePriceConfig = exchangePricesAndConfig[index];
  //     // const tokenBalance = liquidityTokenBalance[index];
  
      
  //     // if(token == "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
  //     //   // console.log("totalAmount", totalAmount)
  //     //   // if(totalAmount.toString() == "3751660910082437275436152023557080578276256744368602576404"){
  //     //   //   totalAmount = "3751347202147885640811734205756683751300244857289831901460"
  //     //   // // console.log("totalAmount OVERWRITTEN", totalAmount)
  //     //   // }

  //     //   // tenderly 3751347202147885640811734205756683751300244857289831901460
  //     //   // console.log("exchangePriceConfig", exchangePriceConfig)
  //     //   // console.log("tokenBalance", tokenBalance)
  //     //   // console.log("block", await api.getBlock())
  //     //   // console.log("timestamp", timestamp)
  //     //   // console.log("api.timestamp", api.timestamp) // WRONG!

  //     //   // correct matching tenderly:
  //     //   // console.log("blockTimestamp", blockTimestamp)
  //     //   // console.log("blockTimestamp via getBlock", (await getBlock(api.chain, timestamp)).timestamp)

  //     //   // console.log("block", await a)
  //     // }

  //     // if (totalAmount === undefined || exchangePriceConfig === undefined || tokenBalance === undefined) return 0;
  //     let _uncollectedRevenue =await (await revenueResolver(api)).getRevenue(
  //       token
  //     ); 
      
  //     // await (await revenueResolver(api)).calcRevenueSimulatedTime(
  //     //   totalAmount,
  //     //   exchangePriceConfig,
  //     //   tokenBalance,
  //     //   blockTimestamp
  //     // );

  //     // if(token == "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
  //     //   // console.log("_uncollectedRevenue", _uncollectedRevenue)
  //     //   _uncollectedRevenue = await (await revenueResolver(api)).getRevenue(
  //     //     token
  //     //   );
  //     //   // console.log("getRevenue", _uncollectedRevenue);
  //     // }
  
  //     return _uncollectedRevenue ?? 0;
  //   })
  // );
}

const getLiquidityRevenues = async ({ fromApi, toApi, getLogs, createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
  const dailyValues = createBalances();
  const tokens: string[] = (await (await liquidityResolver(fromApi)).listedTokens()).map((t: string) => t.toLowerCase());

  // const fromTokens: string[] = (await (await liquidityResolver(fromApi)).listedTokens()).map((t: string) => t.toLowerCase());
  // const toTokens: string[] = (await (await liquidityResolver(toApi)).listedTokens()).map((t: string) => t.toLowerCase());
  // if (fromTokens.join(',') !== toTokens.join(',')) {
  //   // console.log(`fromTokens`, fromTokens);
  //   // console.log(`toTokens`, toTokens);
  // }

  // Fetch uncollected revenues for the "from" and "to" timestamps
  const [revenuesFrom, revenuesTo] = await Promise.all([
    getUncollectedLiquidities(fromApi, fromTimestamp, tokens),
    getUncollectedLiquidities(toApi, toTimestamp, tokens)
  ]);

  // // Fetch uncollected revenues for the "from" and "to" timestamps
  // const revenuesFrom = await getUncollectedLiquidities(fromApi, fromTimestamp, tokens);
  // const revenuesTo = await getUncollectedLiquidities(toApi, toTimestamp, tokens);

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

    // console.log("token", token);
    if(token == "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
      // console.log("revenueTo", revenuesTo[i]);
      // console.log("revenueFrom",revenuesFrom[i]);
      // console.log("netRevenue",netRevenue);
      // console.log("collectedRevenue",collectedRevenue);
    }
    
    const revenueBefore = await dailyValues.getUSDValue();

    dailyValues.add(token, netRevenue)

    const revenueAfter =  await dailyValues.getUSDValue();
    // console.log((revenueAfter - revenueBefore).toString(), "added revenue");
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
  // console.log(options.fromTimestamp, "fromTimestamp before")
  // console.log(options.toTimestamp, "toTimestamp before")
  // options.fromTimestamp = await getTimestamp(await options.fromApi.getBlock(), options.fromApi.chain);
  // options.toTimestamp = await getTimestamp(await options.toApi.getBlock(), options.toApi.chain);
  // console.log(options.fromTimestamp, "fromTimestamp after")
  // console.log(options.toTimestamp, "toTimestamp after")
  const [liquidityRevenues, vaultRevenues] = await Promise.all([
    getLiquidityRevenues(options),
    getVaultsT1Revenues(options)
  ])
  // console.log("liquidityRevenues", liquidityRevenues)
  // console.log("vaultRevenues", vaultRevenues)
  return liquidityRevenues + vaultRevenues
}