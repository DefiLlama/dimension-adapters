import { Balances, ChainApi } from "@defillama/sdk";
import { BigNumber } from "bignumber.js";
import { FetchOptions } from "../../adapters/types";
import { ABI, EVENT_ABI, TOPIC0, parseInTopic, zeroAddress } from "../fluid/config";

const LIQUIDITY = "0x52Aa899454998Be5b000Ad077a46Bbe360F4e497";
const LIQUIDITY_RESOLVER = "0xca13A15de31235A37134B4717021C35A3CF25C60";
const REVENUE_RESOLVER = "0x0A84741D50B4190B424f57425b09FAe60C330F32";

// Liquidity-layer revenue: protocol's cut from the spread between supply/borrow rates
const getLiquidityRevenues = async ({ fromApi, api, getLogs, createBalances }: FetchOptions): Promise<Balances> => {
  const dailyRevenue = createBalances();
  const tokens: string[] = (await api.call({ target: LIQUIDITY_RESOLVER, abi: ABI.liquidityResolver.listedTokens })).map((t: string) => t.toLowerCase());
  if (!tokens.length) return dailyRevenue;

  const calls = tokens.map(t => ({ target: REVENUE_RESOLVER, params: [t] }));
  const [revenuesFrom, revenuesTo] = await Promise.all([
    fromApi.multiCall({ calls, abi: ABI.revenueResolver.getRevenue, permitFailure: true }),
    api.multiCall({ calls, abi: ABI.revenueResolver.getRevenue, permitFailure: true }),
  ]);

  for (const [index, token] of tokens.entries()) {
    if (!token) continue;
    const initialRev = new BigNumber(revenuesFrom[index] || "0");
    const finalRev = new BigNumber(revenuesTo[index] || "0");

    const collectedLogs = await getLogs({
      target: LIQUIDITY,
      onlyArgs: true,
      topics: [TOPIC0.logCollectRevenue, parseInTopic(token)],
      eventAbi: EVENT_ABI.logCollectRevenue,
      skipCacheRead: true,
      skipIndexer: true,
    });

    const collected = collectedLogs.reduce(
      (acc: BigNumber, log: any) => acc.plus(new BigNumber(log.amount || "0")),
      new BigNumber(0),
    );

    const net = finalRev.plus(collected).minus(initialRev);
    if (net.isPositive()) {
      dailyRevenue.add(token, net.integerValue(BigNumber.ROUND_FLOOR));
    }
  }
  return dailyRevenue;
};

// Vault-level revenue: spread between vault and liquidity/dex totals
const getVaultUncollectedRevenues = (createBalances: () => Balances, vaultDatas: any[]): Balances => {
  const revenue = createBalances();
  for (const vaultData of vaultDatas) {
    if (!vaultData) continue;
    const supplyAndBorrow = vaultData.totalSupplyAndBorrow;
    const cv = vaultData.constantVariables;
    if (!supplyAndBorrow || !cv) continue;

    // For smart vaults, supply/borrow tokens are structs with token0/token1
    const isSmartCol = cv.vaultType > 0 && cv.supplyToken?.token1 != zeroAddress;
    const isSmartDebt = cv.vaultType > 0 && cv.borrowToken?.token1 != zeroAddress;

    const supplyToken = isSmartCol ? cv.supplyToken?.token0 : (cv.supplyToken?.token0 || cv.supplyToken);
    const borrowToken = isSmartDebt ? cv.borrowToken?.token0 : (cv.borrowToken?.token0 || cv.borrowToken);
    if (!supplyToken || !borrowToken) continue;

    const totalSupplyVault = new BigNumber(supplyAndBorrow.totalSupplyVault || "0");
    const totalBorrowVault = new BigNumber(supplyAndBorrow.totalBorrowVault || "0");
    const totalSupplyLiquidity = new BigNumber(supplyAndBorrow.totalSupplyLiquidityOrDex || "0");
    const totalBorrowLiquidity = new BigNumber(supplyAndBorrow.totalBorrowLiquidityOrDex || "0");

    // Supply side: vault gets more from liquidity than it passes to users
    const supplyProfit = totalSupplyLiquidity.minus(totalSupplyVault);
    if (supplyProfit.isPositive()) revenue.add(supplyToken, supplyProfit);

    // Borrow side: vault charges users more than it pays to liquidity
    const borrowProfit = totalBorrowVault.minus(totalBorrowLiquidity);
    if (borrowProfit.isPositive()) revenue.add(borrowToken, borrowProfit);
  }
  return revenue;
};

const getVaultCollectedRevenues = async (createBalances: () => Balances, getLogs: Function, api: ChainApi, vaults: string[]): Promise<Balances> => {
  const revenue = createBalances();
  const rebalanceLogs: any[] = await getLogs({ targets: vaults, onlyArgs: true, flatten: false, eventAbi: EVENT_ABI.logRebalance, skipCacheRead: true });
  const contractViews = await api.multiCall({ abi: ABI.vault.constantsView, calls: vaults, permitFailure: true });
  if (!rebalanceLogs.length || !contractViews.length) return revenue;

  rebalanceLogs.forEach((logs: any[], index: number) => {
    logs.forEach((log: any) => {
      if (!log) return;
      const colAmt = new BigNumber(log[0] || "0");
      const debtAmt = new BigNumber(log[1] || "0");
      const supplyToken = contractViews[index]?.supplyToken;
      const borrowToken = contractViews[index]?.borrowToken;

      // Negative col = protocol extracted collateral (revenue)
      if (colAmt.lt(0) && supplyToken) {
        revenue.add(supplyToken, colAmt.abs().integerValue(BigNumber.ROUND_FLOOR));
      }
      // Positive debt = protocol extracted debt (revenue)
      if (debtAmt.gt(0) && borrowToken) {
        revenue.add(borrowToken, debtAmt.integerValue(BigNumber.ROUND_FLOOR));
      }
    });
  });

  return revenue;
};

const getVaultRevenues = async (options: FetchOptions, vaults: string[], vaultDatasFrom: any[], vaultDatasTo: any[]): Promise<Balances> => {
  const dailyRevenue = options.createBalances();

  const [vaultCollected] = await Promise.all([
    getVaultCollectedRevenues(options.createBalances, options.getLogs, options.api, vaults),
  ]);

  const uncollectedFrom = getVaultUncollectedRevenues(options.createBalances, vaultDatasFrom);
  const uncollectedTo = getVaultUncollectedRevenues(options.createBalances, vaultDatasTo);

  // daily vault revenue = endUncollected + collected - startUncollected
  uncollectedTo.addBalances(vaultCollected);
  uncollectedTo.subtract(uncollectedFrom);
  uncollectedTo.removeNegativeBalances();
  dailyRevenue.addBalances(uncollectedTo);

  return dailyRevenue;
};

export const getDailyRevenue = async (options: FetchOptions, vaults: string[], vaultDatasFrom: any[], vaultDatasTo: any[]): Promise<Balances> => {
  const dailyRevenue = options.createBalances();

  const [liquidityRevenue, vaultRevenue] = await Promise.all([
    getLiquidityRevenues(options),
    getVaultRevenues(options, vaults, vaultDatasFrom, vaultDatasTo),
  ]);

  dailyRevenue.addBalances(liquidityRevenue, "Venus Flux Borrow Interest to Treasury");
  dailyRevenue.addBalances(vaultRevenue, "Venus Flux Borrow Interest to Treasury");
  return dailyRevenue;
};
