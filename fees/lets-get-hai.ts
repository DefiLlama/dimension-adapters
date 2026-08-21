import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getPrices } from "../utils/prices";

// Lets Get HAI, multi-collateral CDP on Optimism 
// https://github.com/hai-on-op/core/tree/main/src/contracts
// docs: https://docs.letsgethai.com/getting-started
const SAFE_ENGINE = "0x9Ff826860689483181C5FAc9628fd2F70275A700";
const TAX_COLLECTOR = "0x62B82ccE08f8F2D808348409E9418c65EB1973C3";
const LIQUIDATION_ENGINE = "0x8Be588895BE9B75F9a9dAee185e0c2ad89891b56";
const COLLATERAL_JOIN_FACTORY = "0xfE7987b1Ee45a8d592B15e8E924d50BFC8536143";
const HAI = "0x10398AbC267496E49106B07dd6BE13364D10dC71";
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

const ABI = {
  collateralList: "function collateralList() view returns (bytes32[])",
  taxSingleOutcome: "function taxSingleOutcome(bytes32) view returns (uint256 newlyAccumulatedRate, int256 deltaRate)",
  cData: "function cData(bytes32) view returns (uint256 debtAmount, uint256 lockedAmount, uint256 accumulatedRate, uint256 safetyPrice, uint256 liquidationPrice)",
  liqCParams: "function cParams(bytes32) view returns (address collateralAuctionHouse, uint256 liquidationPenalty, uint256 liquidationQuantity)",
  collateralJoins: "function collateralJoins(bytes32) view returns (address)",
  joinCollateral: "function collateral() view returns (address)",
  buyCollateral: "event BuyCollateral(uint256 indexed _id, address _bidder, uint256 _blockTimestamp, uint256 _raisedAmount, uint256 _soldAmount)",
  liquidate: "event Liquidate(bytes32 indexed _cType, address indexed _safe, uint256 _collateralAmount, uint256 _debtAmount, uint256 _amountToRaise, address _collateralAuctioneer, uint256 _auctionId)",
};

const RAY = 10n ** 27n;
const WAD = 10n ** 18n;
const START_BLOCK = 116000000;
const LIQUIDATION_YIELD = "Liquidation Yield";
const key = (token: string) => `${CHAIN.OPTIMISM}:${token}`;
const auctionKey = (auctioneer: string, id: any) => `${auctioneer.toLowerCase()}:${id}`;

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi, getLogs } = options;
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const cTypes: string[] = await toApi.call({ target: TAX_COLLECTOR, abi: ABI.collateralList });

  // Stability fees = SAFEEngine.debt × Δ(taxSingleOutcome accumulatedRate)
  const [startOutcome, endOutcome, debtData, liqParams, joins] = await Promise.all([
    fromApi.multiCall({ target: TAX_COLLECTOR, abi: ABI.taxSingleOutcome, calls: cTypes, permitFailure: true }),
    toApi.multiCall({ target: TAX_COLLECTOR, abi: ABI.taxSingleOutcome, calls: cTypes, permitFailure: true }),
    toApi.multiCall({ target: SAFE_ENGINE, abi: ABI.cData, calls: cTypes, permitFailure: true }),
    toApi.multiCall({ target: LIQUIDATION_ENGINE, abi: ABI.liqCParams, calls: cTypes, permitFailure: true }),
    toApi.multiCall({ target: COLLATERAL_JOIN_FACTORY, abi: ABI.collateralJoins, calls: cTypes, permitFailure: true }),
  ]);

  for (let i = 0; i < cTypes.length; i++) {
    if (!startOutcome[i] || !endOutcome[i] || !debtData[i]) continue;
    const debt = BigInt(debtData[i].debtAmount);
    const deltaRate = BigInt(endOutcome[i].newlyAccumulatedRate) - BigInt(startOutcome[i].newlyAccumulatedRate);
    if (debt === 0n || deltaRate <= 0n) continue;
    const fee = (debt * deltaRate) / RAY;
    dailyFees.add(HAI, fee, METRIC.BORROW_INTEREST);
    dailyRevenue.add(HAI, fee, METRIC.BORROW_INTEREST);
  }

  // each collateral has its own CollateralAuctionHouse + collateral token
  const collateralTokens = await toApi.multiCall({ abi: ABI.joinCollateral, calls: joins.map((j: string) => j || ADDRESS_ZERO), permitFailure: true });
  const auctionHouses: string[] = [];
  const houseInfo: Record<string, { penalty: bigint; token?: string }> = {};
  const penaltyByCType: Record<string, bigint> = {};
  for (let i = 0; i < cTypes.length; i++) {
    if (!liqParams[i]) continue;
    const penalty = BigInt(liqParams[i].liquidationPenalty);
    if (penalty <= WAD) continue; // no penalty configured
    const house = liqParams[i].collateralAuctionHouse.toLowerCase();
    auctionHouses.push(house);
    const token = collateralTokens[i] && collateralTokens[i] !== ADDRESS_ZERO ? collateralTokens[i].toLowerCase() : undefined;
    houseInfo[house] = { penalty, token };
    penaltyByCType[cTypes[i].toLowerCase()] = penalty;
  }
  if (!auctionHouses.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  // Liquidation penalty
  const liquidateLogs = await getLogs({ target: LIQUIDATION_ENGINE, eventAbi: ABI.liquidate, fromBlock: START_BLOCK, toBlock, entireLog: true, cacheInCloud: true });
  const debtValueByAuction = new Map<string, bigint>();
  for (const log of liquidateLogs) {
    const penalty = penaltyByCType[String(log.args._cType).toLowerCase()];
    if (!penalty || penalty <= WAD) continue;
    const debtValue = (BigInt(log.args._amountToRaise) * WAD) / penalty;
    debtValueByAuction.set(auctionKey(log.args._collateralAuctioneer, log.args._auctionId), debtValue);
  }

  const allBuys = await getLogs({ targets: auctionHouses, eventAbi: ABI.buyCollateral, fromBlock: START_BLOCK, toBlock, entireLog: true, flatten: true, cacheInCloud: true });
  allBuys.sort((a: any, b: any) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  const paidByAuction = new Map<string, bigint>(); // auctionKey -> cumulative HAI raised [rad]
  const buys: { token?: string; raised: bigint; sold: bigint; ts: number }[] = [];
  for (const log of allBuys) {
    const house = log.address.toLowerCase();
    const akey = auctionKey(house, log.args._id);
    const raisedWad = BigInt(log.args._raisedAmount);
    const raisedRad = raisedWad * RAY;
    const before = paidByAuction.get(akey) || 0n;
    const after = before + raisedRad;
    paidByAuction.set(akey, after);

    if (log.blockNumber < fromBlock || log.blockNumber > toBlock) continue;

    const debtValue = debtValueByAuction.get(akey);
    if (debtValue !== undefined) {
      const debtCoveredBefore = before < debtValue ? before : debtValue;
      const debtCoveredAfter = after < debtValue ? after : debtValue;
      const penalty = (raisedRad - (debtCoveredAfter - debtCoveredBefore)) / RAY;
      if (penalty > 0n) {
        dailyFees.add(HAI, penalty, METRIC.LIQUIDATION_FEES);
        dailyRevenue.add(HAI, penalty, METRIC.LIQUIDATION_FEES);
      }
    }

    buys.push({ token: houseInfo[house]?.token, raised: raisedWad, sold: BigInt(log.args._soldAmount), ts: Number(log.args._blockTimestamp) });
  }

  // Supply-side liquidation yield 
  const collateralKeys = [...new Set(buys.map((b) => b.token).filter(Boolean))].map((t) => key(t!));
  const uniqueTs = [...new Set(buys.map((b) => b.ts))];
  const pricesByTs: Record<number, any> = {};
  await Promise.all(uniqueTs.map(async (ts) => { pricesByTs[ts] = await getPrices([key(HAI), ...collateralKeys], ts); }));

  for (const b of buys) {
    if (!b.token) continue;
    const prices = pricesByTs[b.ts];
    const collateralPrice = prices[key(b.token)]?.price;
    const haiPrice = prices[key(HAI)]?.price;
    if (!collateralPrice || !haiPrice) continue;
    const discountUSD = (Number(b.sold) / 1e18) * collateralPrice - (Number(b.raised) / 1e18) * haiPrice;
    if (discountUSD > 0) {
      dailyFees.addUSDValue(discountUSD, LIQUIDATION_YIELD);
      dailySupplySideRevenue.addUSDValue(discountUSD, LIQUIDATION_YIELD);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: "2024-02-20",
  methodology: {
    Fees: "Stability fees (per-second interest on HAI debt), liquidation penalties (surcharge on liquidated debt), and liquidation yield (the discount auction buyers receive on seized collateral).",
    Revenue: "Stability fees + liquidation penalties, all captured by protocol-controlled receivers (AccountingEngine surplus + StabilityFeeTreasury + HAI DAO treasury, verified on-chain).",
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue: "Liquidation yield, the discount (collateral value − HAI paid) earned by auction buyers / Stability Pool (sHAI) depositors, valued at each buy's timestamp.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Per-second stability fee accrued on HAI debt, from differencing TaxCollector.taxSingleOutcome()'s accumulatedRate across the day × SAFEEngine debt.",
      [METRIC.LIQUIDATION_FEES]: "Realized liquidation penalty, HAI raised in collateral auctions above the seized debt (debt-first per auction, from Liquidate.amountToRaise and cumulative BuyCollateral proceeds).",
      [LIQUIDATION_YIELD]: "Discount on seized collateral (collateral value − HAI paid), priced at each buy's own timestamp.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Stability fees, captured by protocol-controlled receivers.",
      [METRIC.LIQUIDATION_FEES]: "Liquidation penalties, sent to the AccountingEngine surplus.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Stability fees, captured by protocol-controlled receivers.",
      [METRIC.LIQUIDATION_FEES]: "Liquidation penalties, sent to the AccountingEngine surplus.",
    },
    SupplySideRevenue: {
      [LIQUIDATION_YIELD]: "Liquidation discount earned by buyers / Stability Pool depositors.",
    },
  },
};

export default adapter;
