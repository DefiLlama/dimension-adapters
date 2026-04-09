import { Balances, ChainApi } from "@defillama/sdk";
import { BigNumber } from "bignumber.js";
import { FetchOptions } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";

const LIQUIDITY = "0x52Aa899454998Be5b000Ad077a46Bbe360F4e497";
const LIQUIDITY_RESOLVER = "0xca13A15de31235A37134B4717021C35A3CF25C60";
const REVENUE_RESOLVER = "0x0A84741D50B4190B424f57425b09FAe60C330F32";
const zeroAddress = ADDRESSES.null;

const revenueAbi = {
  getRevenue: "function getRevenue(address token_) public view returns (uint256 revenueAmount_)",
  listedTokens: "function listedTokens() public view returns (address[] listedTokens_)",
  getVaultEntireData: "function getVaultEntireData(address vault_) view returns ((address vault, bool isSmartCol, bool isSmartDebt, (address liquidity, address factory, address operateImplementation, address adminImplementation, address secondaryImplementation, address deployer, address supply, address borrow, (address token0, address token1) supplyToken, (address token0, address token1) borrowToken, uint256 vaultId, uint256 vaultType, bytes32 supplyExchangePriceSlot, bytes32 borrowExchangePriceSlot, bytes32 userSupplySlot, bytes32 userBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePriceOperate, uint256 oraclePriceLiquidate, address rebalancer, uint256 lastUpdateTimestamp) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, int256 supplyRateVault, int256 borrowRateVault, int256 rewardsOrFeeRateSupply, int256 rewardsOrFeeRateBorrow) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidityOrDex, uint256 totalBorrowLiquidityOrDex, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization) liquidityUserBorrowData) vaultData_)",
  logCollectRevenue: "event LogCollectRevenue(address indexed token, uint256 indexed amount)",
  logRebalance: "event LogRebalance(int colAmt_, int debtAmt_)",
  constantsView: "function constantsView() public view returns((address liquidity,address factory,address adminImplementation,address secondaryImplementation,address supplyToken,address borrowToken,uint8 supplyDecimals,uint8 borrowDecimals,uint vaultId,bytes32 liquiditySupplyExchangePriceSlot,bytes32 liquidityBorrowExchangePriceSlot,bytes32 liquidityUserSupplySlot,bytes32 liquidityUserBorrowSlot))",
};

const TOPIC0_COLLECT_REVENUE = '0x7ded56fbc1e1a41c85fd5fb3d0ce91eafc72414b7f06ed356c1d921823d4c37c';

const parseInTopic = (address: string): string => {
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
};

// Liquidity-layer revenue: protocol's cut from the spread between supply/borrow rates
const getLiquidityRevenues = async ({ fromApi, api, getLogs, createBalances }: FetchOptions): Promise<Balances> => {
  const dailyRevenue = createBalances();
  const tokens: string[] = (await api.call({ target: LIQUIDITY_RESOLVER, abi: revenueAbi.listedTokens })).map((t: string) => t.toLowerCase());
  if (!tokens.length) return dailyRevenue;

  const calls = tokens.map(t => ({ target: REVENUE_RESOLVER, params: [t] }));
  const [revenuesFrom, revenuesTo] = await Promise.all([
    fromApi.multiCall({ calls, abi: revenueAbi.getRevenue, permitFailure: true }),
    api.multiCall({ calls, abi: revenueAbi.getRevenue, permitFailure: true }),
  ]);

  for (const [index, token] of tokens.entries()) {
    if (!token) continue;
    const initialRev = new BigNumber(revenuesFrom[index] || "0");
    const finalRev = new BigNumber(revenuesTo[index] || "0");

    const collectedLogs = await getLogs({
      target: LIQUIDITY,
      onlyArgs: true,
      topics: [TOPIC0_COLLECT_REVENUE, parseInTopic(token)],
      eventAbi: revenueAbi.logCollectRevenue,
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
  const rebalanceLogs: any[] = await getLogs({ targets: vaults, onlyArgs: true, flatten: false, eventAbi: revenueAbi.logRebalance, skipCacheRead: true });
  const contractViews = await api.multiCall({ abi: revenueAbi.constantsView, calls: vaults, permitFailure: true });
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
