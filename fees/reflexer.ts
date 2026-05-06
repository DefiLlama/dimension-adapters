import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const RAY = 10n ** 27n;
const HUNDRED = 100n;
const SURPLUS_AUCTION_STAKING_REWARDS_SHARE = 50n;
const START_BLOCK = 11848304;

const RAI = "0x03ab458634910AaD20eF5f1C8ee96F1D6ac54919";
const SAFE_ENGINE = "0xCC88a9d330da1133Df3A7bD823B95e52511A6962";
const TAX_COLLECTOR = "0xcDB05aEda142a1B0D6044C09C64e4226c1a281EB";
const LIQUIDATION_ENGINE = "0x4fFbAA89d648079Faafc7852dE49EA1dc92f9976";
const SURPLUS_AUCTION_HOUSE = "0x4EEfDaE928ca97817302242a851f317Be1B85C90";
const FLX = "0x6243d8CEA23066d098a15582d81a598b4e8391F4";
const ACCOUNTING_ENGINE = "0xcEe6Aa1aB47d0Fb0f24f51A3072EC16E20F90fcE".toLowerCase();
const STABILITY_FEE_TREASURY = "0x83533fdd3285f48204215E9CF38C785371258E76".toLowerCase();

const LABELS = {
  stabilityFees: "Stability Fees",
  stabilityFeesToAccountingEngine: "Stability Fees To Accounting Engine",
  stabilityFeesToStabilityFeeTreasury: "Stability Fees To Stability Fee Treasury",
  stabilityFeesToProtocolReceivers: "Stability Fees To Protocol Receivers",
  liquidationFees: METRIC.LIQUIDATION_FEES,
  liquidationFeesToAccountingEngine: "Liquidation Fees To Accounting Engine",
  protocolRevenueNetOfHolderAllocations: "Protocol Revenue Net Of Holder Allocations",
  tokenBuyBack: METRIC.TOKEN_BUY_BACK,
  stakingRewards: METRIC.STAKING_REWARDS,
};

const abi = {
  collateralListLength: "uint256:collateralListLength",
  collateralList: "function collateralList(uint256) view returns (bytes32)",
  collateralTypes:
    "function collateralTypes(bytes32) view returns (uint256 debtAmount, uint256 accumulatedRate, uint256 safetyPrice, uint256 debtCeiling, uint256 debtFloor, uint256 liquidationPrice)",
  distributeTax: "event DistributeTax(bytes32 indexed collateralType, address indexed target, int256 taxCut)",
  liquidate:
    "event Liquidate(bytes32 indexed collateralType, address indexed safe, uint256 collateralAmount, uint256 debtAmount, uint256 amountToRaise, address collateralAuctioneer, uint256 auctionId)",
  buyCollateral: "event BuyCollateral(uint256 indexed id, uint256 wad, uint256 boughtCollateral)",
  surplusBid: "event IncreaseBidSize(uint256 id, address highBidder, uint256 amountToBuy, uint256 bid, uint256 bidExpiry)",
  surplusSettle: "event SettleAuction(uint256 indexed id)",
  modifySAFE:
    "event ModifySAFECollateralization(bytes32 indexed collateralType, address indexed safe, address collateralSource, address debtDestination, int256 deltaCollateral, int256 deltaDebt, uint256 lockedCollateral, uint256 generatedDebt, uint256 globalDebt)",
  confiscateSAFE:
    "event ConfiscateSAFECollateralAndDebt(bytes32 indexed collateralType, address indexed safe, address collateralCounterparty, address debtCounterparty, int256 deltaCollateral, int256 deltaDebt, uint256 globalUnbackedDebt)",
};

const safeEngineInterface = new Interface([abi.modifySAFE, abi.confiscateSAFE]);
const taxCollectorInterface = new Interface([abi.distributeTax]);
const liquidationEngineInterface = new Interface([abi.liquidate]);
const collateralAuctionInterface = new Interface([abi.buyCollateral]);
const surplusAuctionInterface = new Interface([abi.surplusBid, abi.surplusSettle]);

type ReflexerEvent = {
  blockNumber: number;
  logIndex: number;
  type: "tax" | "debt";
  collateralType: string;
  taxCut?: bigint;
  target?: string;
  deltaDebt?: bigint;
};

type LiquidationAuction = {
  auctioneer: string;
  id: string;
  rateAdjustedDebt: bigint;
};

const toNumber = (value: number | string) => Number(value);

const normalizeCollateralType = (collateralType: string) => collateralType.toLowerCase();

const getEventPosition = (log: any) => ({
  blockNumber: toNumber(log.blockNumber),
  logIndex: toNumber(log.logIndex),
});

const getDebtAmount = (collateralType: any) => BigInt(collateralType?.debtAmount ?? collateralType?.[0] ?? 0);

const getAddress = (log: any) => (log.address || log.source || "").toLowerCase();

const isWithinCurrentWindow = (event: { blockNumber: number }, fromBlock: number, toBlock: number) =>
  event.blockNumber >= fromBlock && event.blockNumber <= toBlock;

const getStabilityFeeRevenueLabel = (target: string) => {
  switch (target.toLowerCase()) {
    case ACCOUNTING_ENGINE:
      return LABELS.stabilityFeesToAccountingEngine;
    case STABILITY_FEE_TREASURY:
      return LABELS.stabilityFeesToStabilityFeeTreasury;
    default:
      return LABELS.stabilityFeesToProtocolReceivers;
  }
};

async function getCollateralTypes(options: FetchOptions, eventCollateralTypes: Set<string>) {
  const length = Number(
    (await options.fromApi.call({
      target: TAX_COLLECTOR,
      abi: abi.collateralListLength,
    })) || 0
  );

  if (length > 0) {
    const collateralTypes = await options.fromApi.multiCall({
      target: TAX_COLLECTOR,
      abi: abi.collateralList,
      calls: Array.from({ length }, (_, index) => ({ params: [index] })),
    });

    collateralTypes.forEach((collateralType: string | null) => {
      if (collateralType) eventCollateralTypes.add(normalizeCollateralType(collateralType));
    });
  }

  return Array.from(eventCollateralTypes);
}

async function getInitialDebtByCollateral(options: FetchOptions, collateralTypes: string[]) {
  const debtByCollateral = new Map<string, bigint>();
  if (!collateralTypes.length) return debtByCollateral;

  const collateralData = await options.fromApi.multiCall({
    target: SAFE_ENGINE,
    abi: abi.collateralTypes,
    calls: collateralTypes.map((collateralType) => ({ params: [collateralType] })),
  });

  collateralTypes.forEach((collateralType, index) => {
    debtByCollateral.set(collateralType, getDebtAmount(collateralData[index]));
  });

  return debtByCollateral;
}

function parseDebtEvents(logs: any[], eventCollateralTypes: Set<string>) {
  return logs.map((log) => {
    const parsedLog = safeEngineInterface.parseLog(log);
    const collateralType = normalizeCollateralType(parsedLog!.args.collateralType);
    eventCollateralTypes.add(collateralType);

    return {
      ...getEventPosition(log),
      type: "debt" as const,
      collateralType,
      deltaDebt: BigInt(parsedLog!.args.deltaDebt),
    };
  });
}

function parseTaxEvents(logs: any[], eventCollateralTypes: Set<string>) {
  return logs.map((log) => {
    const parsedLog = taxCollectorInterface.parseLog(log);
    const collateralType = normalizeCollateralType(parsedLog!.args.collateralType);
    eventCollateralTypes.add(collateralType);

    return {
      ...getEventPosition(log),
      type: "tax" as const,
      collateralType,
      target: parsedLog!.args.target.toLowerCase(),
      taxCut: BigInt(parsedLog!.args.taxCut),
    };
  });
}

function parseLiquidationAuctions(logs: any[]) {
  return logs.map((log) => {
    const parsedLog = liquidationEngineInterface.parseLog(log);
    const auctioneer = parsedLog!.args.collateralAuctioneer.toLowerCase();
    const id = parsedLog!.args.auctionId.toString();

    return {
      ...getEventPosition(log),
      auctioneer,
      id,
      // Liquidate.amountToRaise is rate adjusted SAFE debt in rad. The auction target includes the liquidation penalty.
      rateAdjustedDebt: BigInt(parsedLog!.args.amountToRaise),
    };
  });
}

function parseBuyCollateralEvents(logs: any[]) {
  return logs.map((log) => {
    const parsedLog = collateralAuctionInterface.parseLog(log);

    return {
      ...getEventPosition(log),
      auctioneer: getAddress(log),
      id: parsedLog!.args.id.toString(),
      amountPaid: BigInt(parsedLog!.args.wad) * RAY,
    };
  });
}

const getAuctionKey = ({ auctioneer, id }: { auctioneer: string; id: string }) => `${auctioneer}:${id}`;

function parseSurplusBids(logs: any[]) {
  return logs.map((log) => {
    const parsedLog = surplusAuctionInterface.parseLog(log);

    return {
      ...getEventPosition(log),
      id: parsedLog!.args.id.toString(),
      bid: BigInt(parsedLog!.args.bid),
    };
  });
}

function parseSurplusSettlements(logs: any[]) {
  return logs.map((log) => {
    const parsedLog = surplusAuctionInterface.parseLog(log);

    return {
      ...getEventPosition(log),
      id: parsedLog!.args.id.toString(),
    };
  });
}

async function addStabilityFees(
  options: FetchOptions,
  dailyFees: any,
  dailyUserFees: any,
  dailyRevenue: any
) {
  const [modifySAFELogs, confiscateSAFELogs, taxLogs] = await Promise.all([
    options.getLogs({ target: SAFE_ENGINE, eventAbi: abi.modifySAFE, entireLog: true }),
    options.getLogs({ target: SAFE_ENGINE, eventAbi: abi.confiscateSAFE, entireLog: true }),
    options.getLogs({ target: TAX_COLLECTOR, eventAbi: abi.distributeTax, entireLog: true }),
  ]);

  const eventCollateralTypes = new Set<string>();
  const events: ReflexerEvent[] = [
    ...parseDebtEvents(modifySAFELogs, eventCollateralTypes),
    ...parseDebtEvents(confiscateSAFELogs, eventCollateralTypes),
    ...parseTaxEvents(taxLogs, eventCollateralTypes),
  ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  const collateralTypes = await getCollateralTypes(options, eventCollateralTypes);
  const debtByCollateral = await getInitialDebtByCollateral(options, collateralTypes);

  for (const event of events) {
    const currentDebt = debtByCollateral.get(event.collateralType) || 0n;

    if (event.type === "debt") {
      debtByCollateral.set(event.collateralType, currentDebt + event.deltaDebt!);
      continue;
    }

    // TaxCollector emits a signed rate cut and SAFEEngine applies it to normalized debt in internal rad units.
    const amount = (currentDebt * event.taxCut!) / RAY;
    if (amount === 0n) continue;

    dailyRevenue.add(RAI, amount, getStabilityFeeRevenueLabel(event.target!));

    if (amount > 0n) {
      dailyFees.add(RAI, amount, LABELS.stabilityFees);
      dailyUserFees.add(RAI, amount, LABELS.stabilityFees);
    }
  }
}

async function addLiquidationFees(
  options: FetchOptions,
  dailyFees: any,
  dailyUserFees: any,
  dailyRevenue: any
) {
  const toBlock = await options.getToBlock();
  const liquidationLogs = await options.getLogs({
    target: LIQUIDATION_ENGINE,
    eventAbi: abi.liquidate,
    fromBlock: START_BLOCK,
    toBlock,
    entireLog: true,
    cacheInCloud: true,
  });

  const auctions = parseLiquidationAuctions(liquidationLogs);
  const auctionDebtById = new Map<string, LiquidationAuction>();
  const auctioneers = new Set<string>();

  for (const auction of auctions) {
    auctionDebtById.set(getAuctionKey(auction), auction);
    auctioneers.add(auction.auctioneer);
  }

  if (!auctioneers.size) return;

  const fromBlock = await options.getFromBlock();
  const buyCollateralLogs = await options.getLogs({
    targets: Array.from(auctioneers),
    eventAbi: abi.buyCollateral,
    fromBlock: START_BLOCK,
    toBlock,
    entireLog: true,
    cacheInCloud: true,
  });

  const paidByAuction = new Map<string, bigint>();
  const buyCollateralEvents = parseBuyCollateralEvents(buyCollateralLogs)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  for (const event of buyCollateralEvents) {
    const key = getAuctionKey(event);
    const auction = auctionDebtById.get(key);
    if (!auction) {
      if (isWithinCurrentWindow(event, fromBlock, toBlock)) {
        throw new Error(
          `Missing liquidation for collateral auction ${event.auctioneer} id ${event.id}`
        );
      }
      continue;
    }

    const alreadyPaid = paidByAuction.get(key) || 0n;
    const paidAfter = alreadyPaid + event.amountPaid;
    paidByAuction.set(key, paidAfter);

    if (!isWithinCurrentWindow(event, fromBlock, toBlock)) continue;

    const debtCoveredBefore = alreadyPaid > auction.rateAdjustedDebt ? auction.rateAdjustedDebt : alreadyPaid;
    const debtCoveredAfter = paidAfter > auction.rateAdjustedDebt ? auction.rateAdjustedDebt : paidAfter;
    const debtPayment = debtCoveredAfter - debtCoveredBefore;
    const liquidationFee = (event.amountPaid - debtPayment) / RAY;
    if (liquidationFee <= 0n) continue;

    dailyFees.add(RAI, liquidationFee, LABELS.liquidationFees);
    dailyUserFees.add(RAI, liquidationFee, LABELS.liquidationFees);
    dailyRevenue.add(RAI, liquidationFee, LABELS.liquidationFeesToAccountingEngine);
  }
}

async function addHoldersRevenue(options: FetchOptions, dailyHoldersRevenue: any) {
  const settleLogs = await options.getLogs({
    target: SURPLUS_AUCTION_HOUSE,
    eventAbi: abi.surplusSettle,
    entireLog: true,
  });
  if (!settleLogs.length) return;

  const bidLogs = await options.getLogs({
    target: SURPLUS_AUCTION_HOUSE,
    eventAbi: abi.surplusBid,
    fromBlock: START_BLOCK,
    entireLog: true,
    cacheInCloud: true,
  });

  const bidById = new Map<string, bigint>();
  parseSurplusBids(bidLogs)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
    .forEach(({ id, bid }) => bidById.set(id, bid));

  for (const { id } of parseSurplusSettlements(settleLogs)) {
    const bid = bidById.get(id);
    if (bid === undefined) {
      throw new Error(`Missing surplus auction bid for settled auction ${id}`);
    }

    const stakingRewards = (bid * SURPLUS_AUCTION_STAKING_REWARDS_SHARE) / HUNDRED;
    const tokenBuyBack = bid - stakingRewards;

    dailyHoldersRevenue.add(FLX, stakingRewards, LABELS.stakingRewards);
    dailyHoldersRevenue.add(FLX, tokenBuyBack, LABELS.tokenBuyBack);
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  await addStabilityFees(options, dailyFees, dailyUserFees, dailyRevenue);
  await addLiquidationFees(options, dailyFees, dailyUserFees, dailyRevenue);
  await addHoldersRevenue(options, dailyHoldersRevenue);

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addUSDValue(
    await dailyRevenue.getUSDValue() - await dailyHoldersRevenue.getUSDValue(),
    LABELS.protocolRevenueNetOfHolderAllocations
  );

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2021-02-13",
  pullHourly: true,
  isExpensiveAdapter: true,
  // Revenue can be negative during rate takebacks and when holder allocations exceed same period revenue.
  allowNegativeValue: true,
  methodology: {
    Fees: "Positive stability fees accrued by Reflexer SAFE debt, plus realized liquidation fees from collateral auctions.",
    UserFees: "Positive stability fees and realized liquidation fees paid through Reflexer SAFEs/liquidations.",
    Revenue: "Signed stability-fee accrual to TaxCollector receivers, plus realized liquidation fees from collateral auctions. Negative stability-fee adjustments reduce revenue but are not added to gross fees.",
    ProtocolRevenue: "Revenue net of FLX sent to staking rewards or burned through Reflexer mixed strategy surplus auctions.",
    HoldersRevenue: "FLX sent to staking rewards and burned through Reflexer mixed strategy surplus auctions.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.stabilityFees]:
        "TaxCollector DistributeTax tax cuts multiplied by the SAFEEngine normalized debt for that collateral type.",
      [LABELS.liquidationFees]:
        "Realized collateral-auction proceeds above the SAFE debt being covered.",
    },
    UserFees: {
      [LABELS.stabilityFees]:
        "TaxCollector DistributeTax tax cuts multiplied by the SAFEEngine normalized debt for that collateral type.",
      [LABELS.liquidationFees]:
        "Realized collateral-auction proceeds above the SAFE debt being covered.",
    },
    Revenue: {
      [LABELS.stabilityFeesToAccountingEngine]: "Signed TaxCollector stability-fee accrual to the AccountingEngine.",
      [LABELS.stabilityFeesToStabilityFeeTreasury]: "Signed TaxCollector stability-fee accrual to the StabilityFeeTreasury.",
      [LABELS.stabilityFeesToProtocolReceivers]: "Signed TaxCollector stability-fee accrual to any other configured receiver.",
      [LABELS.liquidationFeesToAccountingEngine]: "Realized collateral-auction proceeds above the SAFE debt being covered.",
    },
    ProtocolRevenue: {
      [LABELS.protocolRevenueNetOfHolderAllocations]:
        "Revenue net of FLX sent to staking rewards or burned through Reflexer mixed strategy surplus auctions.",
    },
    HoldersRevenue: {
      [LABELS.stakingRewards]: "The half of settled surplus-auction FLX bids sent to the staking rewards dripper.",
      [LABELS.tokenBuyBack]: "The half of settled surplus-auction FLX bids burned by the auction house.",
    },
  },
};

export default adapter;
