import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { BigNumber } from "bignumber.js";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getDailyRevenue } from "./revenue";

const LIQUIDITY = "0x52Aa899454998Be5b000Ad077a46Bbe360F4e497";
const VAULT_RESOLVER = "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC";
const DEX_RESOLVER = "0xAf572EfC84d905926F7b05C1B7bE04e4E89542B0";

const zeroAddress = ADDRESSES.null;
const reserveContract = "0x264786EF916af64a1DB19F513F24a3681734ce92";

const abi = {
  vaultResolver: {
    getVaultEntireData: "function getVaultEntireData(address vault_) view returns ((address vault, bool isSmartCol, bool isSmartDebt, (address liquidity, address factory, address operateImplementation, address adminImplementation, address secondaryImplementation, address deployer, address supply, address borrow, (address token0, address token1) supplyToken, (address token0, address token1) borrowToken, uint256 vaultId, uint256 vaultType, bytes32 supplyExchangePriceSlot, bytes32 borrowExchangePriceSlot, bytes32 userSupplySlot, bytes32 userBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePriceOperate, uint256 oraclePriceLiquidate, address rebalancer, uint256 lastUpdateTimestamp) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, int256 supplyRateVault, int256 borrowRateVault, int256 rewardsOrFeeRateSupply, int256 rewardsOrFeeRateBorrow) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidityOrDex, uint256 totalBorrowLiquidityOrDex, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization) liquidityUserBorrowData) vaultData_)",
  },
  dexResolver: {
    getDexTokens: "function getDexTokens(address dex_) external view returns (address token0_, address token1_)",
    getDexState: "function getDexState(address dex_) returns ((uint256 lastToLastStoredPrice, uint256 lastStoredPrice, uint256 centerPrice, uint256 lastUpdateTimestamp, uint256 lastPricesTimeDiff, uint256 oracleCheckPoint, uint256 oracleMapping, uint256 totalSupplyShares, uint256 totalBorrowShares, bool isSwapAndArbitragePaused, (bool isRangeChangeActive, bool isThresholdChangeActive, bool isCenterPriceShiftActive, (uint256 oldUpper, uint256 oldLower, uint256 duration, uint256 startTimestamp, uint256 oldTime) rangeShift, (uint256 oldUpper, uint256 oldLower, uint256 duration, uint256 startTimestamp, uint256 oldTime) thresholdShift, (uint256 shiftPercentage, uint256 duration, uint256 startTimestamp) centerPriceShift) shifts, uint256 token0PerSupplyShare, uint256 token1PerSupplyShare, uint256 token0PerBorrowShare, uint256 token1PerBorrowShare) state_)",
  },
};

const logOperateEvent = "event LogOperate(address indexed user, address indexed token, int256 supplyAmount, int256 borrowAmount, address withdrawTo, address borrowTo, uint256 totalAmounts, uint256 exchangePricesAndConfig)";

const getAllVaults = async (api: any): Promise<string[]> => {
  return api.call({ target: VAULT_RESOLVER, abi: "function getAllVaultsAddresses() external view returns (address[] vaults_)" });
};

const getVaultsDailyBorrowFees = async ({ fromApi, api, createBalances }: FetchOptions, logOperates: any[], vaults: string[], vaultDatasFrom: any[], vaultDatasTo: any[]) => {
  const dailyFees = createBalances();

  for (const [index, vault] of vaults.entries()) {
    if (!vault) continue;
    const vaultDataFrom = vaultDatasFrom[index];
    const vaultDataTo = vaultDatasTo[index];
    if (!vaultDataFrom || !vaultDataTo) continue;

    const vaultFrom = vaultDataFrom.vault;
    const vaultTo = vaultDataTo.vault;
    if (!vaultFrom || !vaultTo || vaultFrom !== vault || vaultTo !== vault) continue;

    // Skip smart debt vaults - tracked at dex level instead
    if (
      vaultDataFrom.constantVariables?.vaultType > 0 &&
      vaultDataFrom.constantVariables?.borrowToken?.token1 != zeroAddress
    ) continue;

    const borrowToken =
      vaultDataFrom.constantVariables?.vaultType > 0
        ? vaultDataFrom.constantVariables.borrowToken.token0
        : vaultDataFrom.constantVariables?.borrowToken?.token0;
    if (!borrowToken) continue;

    let borrowBalances = new BigNumber(vaultDataFrom.totalSupplyAndBorrow?.totalBorrowVault || "0");
    const borrowBalanceTo = new BigNumber(vaultDataTo.totalSupplyAndBorrow?.totalBorrowVault || "0");
    if (borrowBalances.isZero() || borrowBalanceTo.isZero()) continue;

    const vaultLogs = logOperates.filter((log: any) => log[0] == vault && log[1] == borrowToken && log[5] !== reserveContract);
    for (const log of vaultLogs) {
      borrowBalances = borrowBalances.plus(log.borrowAmount);
    }

    const fees = borrowBalanceTo.minus(borrowBalances);
    if (fees.isPositive()) {
      dailyFees.add(borrowToken, fees.integerValue(BigNumber.ROUND_FLOOR));
    }
  }
  return dailyFees;
};

const getDexesDailyBorrowFees = async ({ fromApi, api, createBalances }: FetchOptions, logOperates: any[], dexes: string[]) => {
  const dailyFees = createBalances();
  if (!dexes.length) return dailyFees;

  const [dexStatesFrom, dexStatesTo, dexTokens] = await Promise.all([
    fromApi.multiCall({ calls: dexes.map(d => ({ target: DEX_RESOLVER, params: [d] })), abi: abi.dexResolver.getDexState, permitFailure: true }),
    api.multiCall({ calls: dexes.map(d => ({ target: DEX_RESOLVER, params: [d] })), abi: abi.dexResolver.getDexState, permitFailure: true }),
    fromApi.multiCall({ calls: dexes.map(d => ({ target: DEX_RESOLVER, params: [d] })), abi: abi.dexResolver.getDexTokens, permitFailure: true }),
  ]);

  for (const [index, dex] of dexes.entries()) {
    if (!dex) continue;
    const dexStateFrom = dexStatesFrom[index];
    const dexStateTo = dexStatesTo[index];
    const tokensInfo = dexTokens[index];

    const token0 = tokensInfo?.token0_;
    const token1 = tokensInfo?.token1_;
    if (!dexStateFrom || !dexStateTo || !token0 || !token1) continue;

    const initialBorrowShares = new BigNumber(dexStateFrom?.totalBorrowShares || "0");
    const finalBorrowShares = new BigNumber(dexStateTo?.totalBorrowShares || "0");
    if (initialBorrowShares.isZero() || finalBorrowShares.isZero()) continue;

    const initialBalance0 = initialBorrowShares.multipliedBy(dexStateFrom?.token0PerBorrowShare || "0").div(1e18);
    const initialBalance1 = initialBorrowShares.multipliedBy(dexStateFrom?.token1PerBorrowShare || "0").div(1e18);
    const finalBalance0 = finalBorrowShares.multipliedBy(dexStateTo?.token0PerBorrowShare || "0").div(1e18);
    const finalBalance1 = finalBorrowShares.multipliedBy(dexStateTo?.token1PerBorrowShare || "0").div(1e18);

    const dexLogs = logOperates.filter((log) => log[0] == dex);
    const dexLogs0 = dexLogs.filter((log) => log[1] == token0 && log[5] !== reserveContract);
    const dexLogs1 = dexLogs.filter((log) => log[1] == token1 && log[5] !== reserveContract);

    const borrowBalance0 = dexLogs0.reduce((bal, log) => bal.plus(new BigNumber(log.borrowAmount || "0")), initialBalance0);
    const borrowBalance1 = dexLogs1.reduce((bal, log) => bal.plus(new BigNumber(log.borrowAmount || "0")), initialBalance1);

    const fees0 = finalBalance0.minus(borrowBalance0);
    const fees1 = finalBalance1.minus(borrowBalance1);

    if (fees0.isPositive()) dailyFees.add(token0, fees0.integerValue(BigNumber.ROUND_FLOOR));
    if (fees1.isPositive()) dailyFees.add(token1, fees1.integerValue(BigNumber.ROUND_FLOOR));
  }

  return dailyFees;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Get Venus Flux vaults from factory
  const vaults: string[] = await getAllVaults(options.fromApi);
  if (!vaults.length) return { dailyFees };

  // Get vault data at start and end of period
  const [vaultDatasFrom, vaultDatasTo] = await Promise.all([
    options.fromApi.multiCall({ calls: vaults.map(v => ({ target: VAULT_RESOLVER, params: [v] })), abi: abi.vaultResolver.getVaultEntireData, permitFailure: true }),
    options.api.multiCall({ calls: vaults.map(v => ({ target: VAULT_RESOLVER, params: [v] })), abi: abi.vaultResolver.getVaultEntireData, permitFailure: true }),
  ]);

  // Collect dex addresses from smart debt vaults
  const dexAddresses = new Set<string>();
  for (const vaultData of vaultDatasFrom) {
    if (!vaultData) continue;
    if (
      vaultData.constantVariables?.vaultType > 0 &&
      vaultData.constantVariables?.borrowToken?.token1 != zeroAddress
    ) {
      const borrowDex = vaultData.constantVariables?.borrow;
      if (borrowDex) dexAddresses.add(borrowDex);
    }
  }

  // Fetch LogOperate events from the liquidity layer
  const logOperates = await options.getLogs({
    target: LIQUIDITY,
    onlyArgs: true,
    eventAbi: logOperateEvent,
    skipCacheRead: true,
    skipIndexer: true,
  });

  if (!logOperates?.length) return { dailyFees };

  const [vaultFees, dexFees, dailyRevenue] = await Promise.all([
    getVaultsDailyBorrowFees(options, logOperates, vaults, vaultDatasFrom, vaultDatasTo),
    getDexesDailyBorrowFees(options, logOperates, [...dexAddresses]),
    getDailyRevenue(options, vaults, vaultDatasFrom, vaultDatasTo),
  ]);

   dailyFees.addBalances(vaultFees, "Venus Flux Borrow Interest");
   dailyFees.addBalances(dexFees, "Venus Flux Borrow Interest");

  const dailySupplySideRevenue = dailyFees.clone(1, "Venus Flux Borrow Interest to Lenders")
  dailySupplySideRevenue.subtract(dailyRevenue, "Venus Flux Borrow Interest to Lenders")

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2025-12-19',
    },
  },
  methodology: {
    Fees: "Interest paid by borrowers on Venus Flux lending protocol.",
    Revenue: "Protocol share of borrow interest.",
    ProtocolRevenue: "Protocol share of borrow interest.",
    SupplySideRevenue: "Interest earned by lenders.",
  },
  breakdownMethodology: {
    Fees: {
      "Venus Flux Borrow Interest": "All interest paid by borrowers across Venus Flux vaults and dex pools.",
    },
    Revenue: {
      "Venus Flux Borrow Interest to Treasury": "Protocol share of borrow interest going to treasury.",
    },
    ProtocolRevenue: {
      "Venus Flux Borrow Interest to Treasury": "Protocol share of borrow interest going to treasury.",
    },
    SupplySideRevenue: {
      "Venus Flux Borrow Interest to Lenders": "Interest distributed to lenders.",
    },
  },
};

export default adapter;
