import * as sdk from "@defillama/sdk";
import { Balances, ChainApi } from "@defillama/sdk";
import { BigNumber } from "bignumber.js";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, CONFIG_FLUID, EVENT_ABI, FLUID_METRICS, LIQUIDITY, parseInTopic, TOPIC0 } from "./config";
import { getVaultsT1Resolver } from "./fees";
import { httpGet } from '../../utils/fetchURL';

interface BuybackData {
  amount: string;
  amountUsd: string;
  blocknumber: number;
  createdAt: string;
  transactionHash: string;
}

type CreateBalances = () => sdk.Balances;

const liquidityResolver = async (api: ChainApi) => {
  const block = await api.getBlock();
  let address: string | undefined;
  const abi = ABI.liquidityResolver;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      address =
        block < 19992056
          ? "0x741c2Cd25f053a55fd94afF1afAEf146523E1249"
          : "0xD7588F6c99605Ab274C211a0AFeC60947668A8Cb";
      break;
    case CHAIN.ARBITRUM:
      address = "0x46859d33E662d4bF18eEED88f74C36256E606e44";
      break;
    case CHAIN.BASE:
      address = "0x35A915336e2b3349FA94c133491b915eD3D3b0cd";
      break;
    case CHAIN.POLYGON:
      address = "0x98d900e25AAf345A4B23f454751EC5083443Fa83";
      break;
    case CHAIN.PLASMA:
      address = "0x4b6Bb77196A7B6D0722059033a600BdCD6C12DB7";
      break;
  }

  return {
    listedTokens: async () =>
      !address ? [] : api.call({ target: address, abi: abi.listedTokens }),
  };
};

const revenueResolver = async (api: ChainApi) => {
  const block = await api.getBlock();
  let address: string | undefined;
  const abi = ABI.revenueResolver;

  switch (api.chain) {
    case CHAIN.ETHEREUM:
      // Fluid revenueResolver existe après le block 19784319
      if (block >= 19784319) {
        address =
          block < 20138676
            ? "0x0F683159f14857D61544650607549Cdc21abE774"
            : "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      }
      break;
    case CHAIN.ARBITRUM:
      address = "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      break;
    case CHAIN.BASE:
      address = "0xFe4affaD55c7AeC012346195654634F7C786fA2c";
      break;
    case CHAIN.POLYGON:
      address = "0x493493f73692Ca94219D3406CE0d2bd08D686BcF";
      break;
    case CHAIN.PLASMA:
      address = "0x03171f3Cf6026148B7dc9450d9CdEe6F0d48BF56";
      break;
  }

  return {
    targetInfo: () => { return { address, abi } },
    getRevenue: async (token: string) => !address ? [] : api.call({ target: address, params: [token], abi: abi.getRevenue }) };
};

const getUncollectedLiquidities = async (api: ChainApi, tokens: string[]) => {
  const { address, abi } = (await revenueResolver(api)).targetInfo();
  if (!address) return [];
  return api.multiCall({ calls: tokens.map((token) => ({ target: address, params: [token] })), abi: abi.getRevenue });
};

const getLiquidityRevenues = async ({ fromApi, api, getLogs, createBalances }: FetchOptions): Promise<Balances> => {
  const dailyValues = createBalances();
  const tokens: string[] = (await (await liquidityResolver(api)).listedTokens()).map((t: string) => t.toLowerCase());
  if (!tokens.length) return dailyValues

  const [revenuesFrom, revenuesTo] = await Promise.all([
    getUncollectedLiquidities(fromApi, tokens),
    getUncollectedLiquidities(api, tokens),
  ]);

  for (const [index, token] of tokens.entries()) {
    if (!token) continue;
    const revenueFrom = revenuesFrom[index]
    const revenueTo = revenuesTo[index]

    const initialRev = new BigNumber(revenueFrom || "0");
    const finalRev = new BigNumber(revenueTo || "0");

    // Default to 0 if revenues are missing
    const collectedRevenueLogs = await getLogs({
      target: LIQUIDITY,
      onlyArgs: true,
      topics:[TOPIC0.logCollectRevenue, parseInTopic(token)],
      eventAbi: EVENT_ABI.logCollectRevenue,
      skipCacheRead: true,
      skipIndexer: true
    })

    const collectedRevenue = collectedRevenueLogs.reduce(
      (acc: BigNumber, log: any) => {
        const amt = new BigNumber(log.amount || "0");
        return acc.plus(amt);
      },
      new BigNumber(0)
    );

    const net = finalRev.plus(collectedRevenue).minus(initialRev);
    const safeNet = net.isPositive() ? net : new BigNumber(0);
    const safeNetInt = safeNet.integerValue(BigNumber.ROUND_FLOOR);
    dailyValues.add(token, safeNetInt);
  }
  return dailyValues
};

const getVaultT1UncollectedRevenues = async (api: ChainApi, createBalances: CreateBalances, vaults: string[]): Promise<Balances> => {
  const dailyRevenue = createBalances();
  const vaultDatas = await (await getVaultsT1Resolver(api)).getVaultEntireData(vaults);
  if (!vaultDatas.length) return dailyRevenue

  for (const [_index, vault] of vaultDatas.entries()) {
    if (!vault) continue;
    const supplyAndBorrow = vault?.totalSupplyAndBorrow
    const constantVariables = vault?.constantVariables
    const supplyToken = constantVariables.supplyToken
    const borrowToken = constantVariables.borrowToken;
    if (!supplyAndBorrow || !constantVariables || !supplyToken || !borrowToken) continue

    const totalSupplyVault = new BigNumber(supplyAndBorrow.totalSupplyVault || "0")
    const totalBorrowVault = new BigNumber(supplyAndBorrow.totalBorrowVault || "0")
    const totalSupplyLiquidity = new BigNumber(supplyAndBorrow.totalSupplyLiquidity || "0")
    const totalBorrowLiquidity = new BigNumber(supplyAndBorrow.totalBorrowLiquidity || "0")
    
    const supplyProfit = totalSupplyLiquidity.minus(totalSupplyVault);
    const safeSupplyProfit = supplyProfit.isPositive() ? supplyProfit : new BigNumber(0);
  
    const borrowProfit = totalBorrowVault.minus(totalBorrowLiquidity);
    const safeBorrowProfit = borrowProfit.isPositive() ? borrowProfit : new BigNumber(0);

    dailyRevenue.add(supplyToken, safeSupplyProfit)
    dailyRevenue.add(borrowToken, safeBorrowProfit)
  }
  return dailyRevenue;
};

const getVaultT1CollectedRevenues = async (api: ChainApi, createBalances: CreateBalances, getLogs: Function, vaults: string[]): Promise<Balances> => {
  const dailyRevenue = createBalances();
  const rebalanceEventLogs: any[] = await getLogs({ targets: vaults, onlyArgs: true, flatten: false, eventAbi: EVENT_ABI.logRebalance, skipCacheRead: true });
  const contractViews = await api.multiCall({ abi: ABI.vault.constantsView, calls: vaults });
  if (!rebalanceEventLogs.length || !contractViews.length) return dailyRevenue;

  rebalanceEventLogs.forEach((logs, index) => {
    logs.forEach((log: any) => {
      if (!!log) {
        const colAmt = new BigNumber(log[0] || "0");
        const debtAmt = new BigNumber(log[1] || "0");
        const supplyToken = contractViews[index]?.supplyToken;
        const borrowToken = contractViews[index]?.borrowToken;

        if (colAmt.lt(0) && supplyToken) {
          const value = colAmt.abs().integerValue(BigNumber.ROUND_FLOOR);
          dailyRevenue.add(supplyToken, value);
        }
        if (debtAmt.gt(0) && borrowToken) {
          const value = debtAmt.integerValue(BigNumber.ROUND_FLOOR);
          dailyRevenue.add(borrowToken, value);
        }
      }
    });
  });

  return dailyRevenue;
};

const getVaultsT1Revenues = async ({ api, fromApi, createBalances, getLogs }: FetchOptions): Promise<Balances> => {
  const dailyRevenue = createBalances()
  const block = await api.getBlock()
  if (block < CONFIG_FLUID[api.chain].vaultResolverExistAfterBlock) return dailyRevenue;

  const vaults: string[] = await (await getVaultsT1Resolver(api)).getAllVaultsAddresses();
  if (!vaults.length) return dailyRevenue

  const [vaultUncollectedBalancesFrom, vaultUncollectedBalancesTo, vaultCollected] =
  await Promise.all([
    getVaultT1UncollectedRevenues(fromApi, createBalances, vaults),
    getVaultT1UncollectedRevenues(api, createBalances, vaults),
    getVaultT1CollectedRevenues(api, createBalances, getLogs, vaults),
  ]);

  vaultUncollectedBalancesTo.addBalances(vaultCollected)
  vaultUncollectedBalancesTo.subtract(vaultUncollectedBalancesFrom);
  vaultUncollectedBalancesTo.removeNegativeBalances()
  dailyRevenue.addBalances(vaultUncollectedBalancesTo)
  return dailyRevenue
};

export const getDailyRevenue = async (options: FetchOptions): Promise<Balances> => {
  const dailyRevenue = options.createBalances()
  const [liquidityRevenues, vaultRevenues] = await Promise.all([
    getLiquidityRevenues(options),
    getVaultsT1Revenues(options),
  ]);

  dailyRevenue.addBalances(liquidityRevenues, FLUID_METRICS.BorrowInterestToTreasury)
  dailyRevenue.addBalances(vaultRevenues, FLUID_METRICS.BorrowInterestToTreasury)
  return dailyRevenue
};

async function fetchHolderRevenue(options: FetchOptions): Promise<BuybackData[]> {
    const params: Record<string, string> = {
      start: new Date(options.fromTimestamp * 1000).toISOString(),
      end: new Date(options.toTimestamp * 1000).toISOString(),
    }

    const buybackApiUrl = `https://api.fluid.instadapp.io/v2/fluid-token/buybacks/charts`;
    return await httpGet(buybackApiUrl, { params });
}

export async function getDailyHoldersRevenue(options: FetchOptions): Promise<Balances> {
  const dailyHoldersRevenue = options.createBalances();

  // Return early if not Ethereum, buyback only done in Ethereum mainnet as of now
  if (options.chain !== CHAIN.ETHEREUM) {
    return dailyHoldersRevenue;
  }

  const buybackData: BuybackData[] = await fetchHolderRevenue(options);
  if (!buybackData.length) {
    return dailyHoldersRevenue;
  }

  for (const item of buybackData) {
    dailyHoldersRevenue.addUSDValue(Number(item.amountUsd), FLUID_METRICS.TokenBuyBack);
  }

  return dailyHoldersRevenue;
}
