import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

type FiraChainConfig = {
  lendingMarkets: string[];
  marketFactory: string;
  legacyMarkets?: Array<{ address: string; id: string }>;
  start?: string;
  fromBlock: number;
  /** Morpho-style lending markets that do not use AccrueInterest (e.g. fixed-rate FiraLendingMarket). */
  excludeFromAccrueInterest?: string[];
};

const configs: Record<string, FiraChainConfig> = {
  [CHAIN.ETHEREUM]: {
    lendingMarkets: [
      '0xa428723eE8ffD87088C36121d72100B43F11fb6A', // legacy UZR market
      '0xc8Db629192a96D6840e88a8451F17655880A2e4D', // variable-rate lending market
      '0x280ddD897F39C33fEf1CbF863B386Cb9a8e53a0e', // fixed-rate lending market
    ],
    marketFactory: '0xBF1EfC2199ae9EE1B6f5060a45D4440157E49744',
    excludeFromAccrueInterest: [
      '0x280ddD897F39C33fEf1CbF863B386Cb9a8e53a0e',
    ],
    // Keep the legacy UZR fixed market as a fallback if CreateMarket logs are incomplete.
    legacyMarkets: [
      {
        address: '0xa428723eE8ffD87088C36121d72100B43F11fb6A',
        id: '0xa597b5a36f6cc0ede718ba58b2e23f5c747da810bf8e299022d88123ab03340e',
      },
    ],
    fromBlock: 21900000,
    start: '2025-11-28',
  }
}

const ABIS = {
  CreateMarketEvent: 'event CreateMarket(bytes32 indexed id, tuple(address loanToken,address collateralToken,address oracle,address irm,uint256 ltv,uint256 lltv,address whitelist) marketParams)',
  CreateNewMarketEvent: 'event CreateNewMarket(address indexed market, address indexed BT, int256 scalarRoot, int256 initialAnchor, uint256 lnFeeRateRoot)',
  idToMarketParams: 'function idToMarketParams(bytes32) view returns(address loanToken, address collateralToken, address oracle, address irm, uint256 ltv, uint256 lltv, address whitelist)',
  market: 'function market(bytes32) view returns(uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  readTokens: 'function readTokens() view returns (address _FW, address _BT, address _CT)',
  price: 'function price() view returns (uint256)',
  AccrueInterestEvent: 'event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)',
  LiquidateEvent: 'event Liquidate(bytes32 indexed id, address indexed caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)',
  SwapEvent: 'event Swap(address indexed caller, address indexed receiver, int256 netBtToAccount, int256 netFwToAccount, uint256 netFwFee, uint256 netFwToReserve)',
  RedeemInterestEvent: 'event RedeemInterest(address indexed user, uint256 interestOut)',
  CollectInterestFeeEvent: 'event CollectInterestFee(uint256 amountInterestFee)',
  TreasuryFwInterestAccruedEvent: 'event TreasuryFwInterestAccrued(uint256 amountAccrued, uint256 newTotalAccrued)',
  FW: 'function FW() view returns (address)',
  CT: 'function CT() view returns (address)',
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const WAD = 10n ** 18n;
  const ORACLE_PRICE_SCALE = 10n ** 36n;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const config = configs[options.chain];
  const lendingMarkets = config.lendingMarkets.map((a) => a.toLowerCase());
  const excludedFromAccrue = new Set((config.excludeFromAccrueInterest ?? []).map((a) => a.toLowerCase()));
  const accrueInterestTargets = lendingMarkets.filter((a) => !excludedFromAccrue.has(a));

  const createMarketLogs = await options.getLogs({
    targets: lendingMarkets,
    eventAbi: ABIS.CreateMarketEvent,
    flatten: false,
    fromBlock: config.fromBlock,
    cacheInCloud: true,
  })

  const discoveredMarkets: Array<{ address: string, id: string }> = [];
  for (let i = 0; i < lendingMarkets.length; i++) {
    const target = lendingMarkets[i];
    const logs = createMarketLogs[i] ?? [];
    for (const log of logs) {
      const id = (log.id ?? '').toLowerCase();
      if (!id) continue;
      discoveredMarkets.push({ address: target, id });
    }
  }
  for (const m of (config.legacyMarkets ?? [])) {
    discoveredMarkets.push({ address: m.address.toLowerCase(), id: m.id.toLowerCase() });
  }

  const marketKeySet = new Set<string>();
  const allMarkets = discoveredMarkets.filter((m) => {
    const key = `${m.address}:${m.id}`;
    if (marketKeySet.has(key)) return false;
    marketKeySet.add(key);
    return true;
  });

  const marketsParams = await options.api.multiCall({
    abi: ABIS.idToMarketParams,
    calls: allMarkets.map(c => ({
      target: c.address,
      params: [c.id],
    })),
    permitFailure: true,
  })

  const markets = await options.api.multiCall({
    abi: ABIS.market,
    calls: allMarkets.map(c => ({
      target: c.address,
      params: [c.id],
    })),
    permitFailure: true,
  })

  const createAmmMarketLogs = await options.getLogs({
    target: config.marketFactory,
    eventAbi: ABIS.CreateNewMarketEvent,
    fromBlock: config.fromBlock,
    cacheInCloud: true,
  })

  const bondTokenCandidates = new Set<string>();
  for (const log of createAmmMarketLogs) {
    const bt = (log.BT ?? log.bt ?? '').toLowerCase();
    if (bt) bondTokenCandidates.add(bt);
  }
  for (let i = 0; i < allMarkets.length; i++) {
    if (!marketsParams[i]) continue;
    if (!excludedFromAccrue.has(allMarkets[i].address)) continue;
    const lt = marketsParams[i]?.loanToken;
    if (lt) bondTokenCandidates.add(String(lt).toLowerCase());
  }

  const bondTokenList = [...bondTokenCandidates].sort();
  const ctFromBondToken = bondTokenList.length
    ? await options.api.multiCall({
      abi: ABIS.CT,
      calls: bondTokenList.map((target) => ({ target })),
      permitFailure: true,
    })
    : [];

  const couponTokens: string[] = [];
  const zeroAddr = '0x0000000000000000000000000000000000000000';
  for (let i = 0; i < bondTokenList.length; i++) {
    const ct = ctFromBondToken[i];
    if (ct === undefined || ct === null) continue;
    const ctStr = String(ct).toLowerCase();
    if (!ctStr || ctStr === zeroAddr) continue;
    couponTokens.push(ctStr);
  }
  const couponTokenList = [...new Set(couponTokens)].sort();

  const interestLogs = accrueInterestTargets.length
    ? await options.getLogs({
      targets: accrueInterestTargets,
      eventAbi: ABIS.AccrueInterestEvent,
      flatten: false,
    })
    : []

  const redeemInterestLogs = couponTokenList.length
    ? await options.getLogs({
      targets: couponTokenList,
      eventAbi: ABIS.RedeemInterestEvent,
      flatten: false,
    })
    : [];
  const collectInterestFeeLogs = couponTokenList.length
    ? await options.getLogs({
      targets: couponTokenList,
      eventAbi: ABIS.CollectInterestFeeEvent,
      flatten: false,
    })
    : [];
  const treasuryFwInterestLogs = couponTokenList.length
    ? await options.getLogs({
      targets: couponTokenList,
      eventAbi: ABIS.TreasuryFwInterestAccruedEvent,
      flatten: false,
    })
    : [];

  const couponFwTokens = couponTokenList.length
    ? await options.api.multiCall({
      abi: ABIS.FW,
      calls: couponTokenList.map((target) => ({ target })),
      permitFailure: true,
    })
    : [];

  const liquidationLogs = await options.getLogs({
    targets: lendingMarkets,
    eventAbi: ABIS.LiquidateEvent,
    flatten: false,
  })

  const ammMarketByBT = new Map<string, string>();
  for (const log of createAmmMarketLogs) {
    const bt = (log.BT ?? log.bt ?? '').toLowerCase();
    const market = (log.market ?? '').toLowerCase();
    if (!bt || !market || ammMarketByBT.has(bt)) continue;
    ammMarketByBT.set(bt, market);
  }

  const ammAddresses = [...new Set(Array.from(ammMarketByBT.values()))];

  const ammTokens = await options.api.multiCall({
    abi: ABIS.readTokens,
    calls: ammAddresses.map((address) => ({ target: address })),
    permitFailure: true,
  })

  const ammTokenByAddress = new Map<string, string>();
  for (let i = 0; i < ammAddresses.length; i++) {
    const fwToken = ammTokens[i]?._FW;
    if (fwToken) ammTokenByAddress.set(ammAddresses[i], fwToken);
  }

  const swapLogs = await options.getLogs({
    targets: ammAddresses,
    eventAbi: ABIS.SwapEvent,
    flatten: false,
  })

  const marketDataByKey = new Map<string, { loanToken: string, oracle: string, fee: bigint }>();
  const oracleSet = new Set<string>();
  for (let i = 0; i < marketsParams.length; i++) {
    if (!marketsParams[i] || !markets[i]) continue;
    const marketAddress = allMarkets[i].address.toLowerCase();
    const marketId = allMarkets[i].id.toLowerCase();
    const loanToken = marketsParams[i]?.loanToken;
    const oracle = marketsParams[i]?.oracle;
    const fee = BigInt(markets[i]?.fee ?? 0);
    if (!loanToken || !oracle) continue;
    marketDataByKey.set(`${marketAddress}:${marketId}`, { loanToken, oracle, fee });
    oracleSet.add(oracle.toLowerCase());
  }

  const oracleAddresses = [...oracleSet];
  const oraclePrices = await options.api.multiCall({
    abi: ABIS.price,
    calls: oracleAddresses.map((target) => ({ target })),
    permitFailure: true,
  })
  const oraclePriceByAddress = new Map<string, bigint>();
  for (let i = 0; i < oracleAddresses.length; i++) {
    const p = oraclePrices[i];
    if (p !== undefined && p !== null) {
      oraclePriceByAddress.set(oracleAddresses[i], BigInt(p));
    }
  }

  // AMM trading fees (FW-denominated): total fee + protocol reserve split.
  for (let i = 0; i < ammAddresses.length; i++) {
    const ammAddress = ammAddresses[i];
    const feeToken = ammTokenByAddress.get(ammAddress);
    if (!feeToken) continue;
    for (const log of swapLogs[i] ?? []) {
      const netFwFee = BigInt(log.netFwFee ?? 0);
      const netFwToReserve = BigInt(log.netFwToReserve ?? 0);
      if (netFwFee <= 0n) continue;
      const ammRevenue = netFwToReserve > netFwFee ? netFwFee : netFwToReserve;
      const ammSupplySideRevenue = netFwFee - ammRevenue;

      dailyFees.add(feeToken, netFwFee, METRIC.SWAP_FEES);
      dailyRevenue.add(feeToken, ammRevenue, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(feeToken, ammSupplySideRevenue, METRIC.SWAP_FEES);
    }
  }

  // Variable-rate lending: AccrueInterest + market(id).fee (Morpho-style).
  for (let i = 0; i < accrueInterestTargets.length; i++) {
    const marketAddress = accrueInterestTargets[i];
    for (const log of interestLogs[i] ?? []) {
      const marketId = (log.id ?? '').toLowerCase();
      const marketData = marketDataByKey.get(`${marketAddress}:${marketId}`);
      if (!marketData) continue;

      const interest = BigInt(log.interest ?? 0);
      if (interest <= 0n) continue;

      const protocolRevenue = (interest * marketData.fee) / WAD;
      const supplySideRevenue = interest - protocolRevenue;

      dailyFees.add(marketData.loanToken, interest, METRIC.BORROW_INTEREST);
      dailyRevenue.add(marketData.loanToken, protocolRevenue, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(marketData.loanToken, supplySideRevenue, METRIC.BORROW_INTEREST);
    }
  }

  // Fixed-rate lending: CT yield leg — interest claimed to users (RedeemInterest), protocol fee at claim (CollectInterestFee),
  // post-expiry FW yield to treasury (TreasuryFwInterestAccrued). Denominated in FW per CT.FW().
  for (let i = 0; i < couponTokenList.length; i++) {
    const fwAddr = couponFwTokens[i] as string | undefined;
    if (!fwAddr) continue;
    const fwToken = String(fwAddr).toLowerCase();

    for (const log of redeemInterestLogs[i] ?? []) {
      const interestOut = BigInt(log.interestOut ?? 0);
      if (interestOut <= 0n) continue;
      dailyFees.add(fwToken, interestOut, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(fwToken, interestOut, METRIC.BORROW_INTEREST);
    }
    for (const log of collectInterestFeeLogs[i] ?? []) {
      const amountInterestFee = BigInt(log.amountInterestFee ?? 0);
      if (amountInterestFee <= 0n) continue;
      dailyFees.add(fwToken, amountInterestFee, METRIC.BORROW_INTEREST);
      dailyRevenue.add(fwToken, amountInterestFee, METRIC.BORROW_INTEREST);
    }
    for (const log of treasuryFwInterestLogs[i] ?? []) {
      const amountAccrued = BigInt(log.amountAccrued ?? 0);
      if (amountAccrued <= 0n) continue;
      dailyFees.add(fwToken, amountAccrued, METRIC.BORROW_INTEREST);
      dailyRevenue.add(fwToken, amountAccrued, METRIC.BORROW_INTEREST);
    }
  }

  // Liquidation penalty (when seized collateral value exceeds repaid debt).
  for (let i = 0; i < lendingMarkets.length; i++) {
    const marketAddress = lendingMarkets[i];
    for (const log of liquidationLogs[i] ?? []) {
      const marketId = (log.id ?? '').toLowerCase();
      const marketData = marketDataByKey.get(`${marketAddress}:${marketId}`);
      if (!marketData) continue;

      const oraclePrice = oraclePriceByAddress.get(marketData.oracle.toLowerCase());
      if (!oraclePrice || oraclePrice <= 0n) continue;

      const repaidAssets = BigInt(log.repaidAssets ?? 0);
      const seizedAssets = BigInt(log.seizedAssets ?? 0);
      const seizedValueInLoanToken = (seizedAssets * oraclePrice) / ORACLE_PRICE_SCALE;
      if (seizedValueInLoanToken <= repaidAssets) continue;

      const liquidationFee = seizedValueInLoanToken - repaidAssets;
      dailyFees.add(marketData.loanToken, liquidationFee, METRIC.LIQUIDATION_FEES);
      dailySupplySideRevenue.add(marketData.loanToken, liquidationFee, METRIC.LIQUIDATION_FEES);
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetch,
  adapter: configs,
  methodology: {
    Fees: 'Sum of AMM trading fees (Swap.netFwFee), variable-rate borrower interest (AccrueInterest.interest), fixed-rate CT interest claims plus post-expiry treasury FW accrual (Coupon Token events), and liquidation penalties paid to external liquidators.',
    Revenue: 'Protocol share from AMM reserve fees (Swap.netFwToReserve), variable-rate borrow interest via market fee rate, and fixed-rate interest fees (CollectInterestFee) plus post-expiry treasury accrual (TreasuryFwInterestAccrued).',
    ProtocolRevenue: 'Protocol share from AMM reserve fees (Swap.netFwToReserve), variable-rate borrow interest via market fee rate, and fixed-rate interest fees (CollectInterestFee) plus post-expiry treasury accrual (TreasuryFwInterestAccrued).',
    SupplySideRevenue: 'AMM swap fees after reserve share, variable-rate interest to lenders, fixed-rate CT interest paid to users (RedeemInterest.interestOut), and liquidation penalties paid out to external liquidators.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Total AMM trading fees from Swap events (netFwFee).',
      [METRIC.BORROW_INTEREST]: 'Variable-rate: total interest from AccrueInterest. Fixed-rate: CT addresses from BondToken.CT() for BTs from AMM CreateNewMarket and fixed lending loan tokens; then RedeemInterest, CollectInterestFee, and TreasuryFwInterestAccrued in FW per CT.',
    },
    Revenue: {
      [METRIC.SWAP_FEES]: 'Protocol reserve share of AMM trading fees from Swap.netFwToReserve.',
      [METRIC.BORROW_INTEREST]: 'Variable-rate: protocol share via market fee. Fixed-rate: CollectInterestFee and TreasuryFwInterestAccrued.',
    },
    SupplySideRevenue: {
      [METRIC.SWAP_FEES]: 'AMM swap fees distributed outside protocol reserve.',
      [METRIC.BORROW_INTEREST]: 'Variable-rate: borrow interest to lenders. Fixed-rate: RedeemInterest to CT holders.',
      [METRIC.LIQUIDATION_FEES]: 'Liquidation penalty estimated as collateral value seized minus debt repaid, converted via market oracle price.',
    },
  },
};

export default adapter;
