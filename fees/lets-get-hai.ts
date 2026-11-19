import * as sdk from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Lets Get HAI, multi-collateral CDP on Optimism 
// https://github.com/hai-on-op/core/tree/main/src/contracts
// docs: https://docs.letsgethai.com/getting-started
const SAFE_ENGINE = "0x9Ff826860689483181C5FAc9628fd2F70275A700";
const TAX_COLLECTOR = "0x62B82ccE08f8F2D808348409E9418c65EB1973C3";
const LIQUIDATION_ENGINE = "0x8Be588895BE9B75F9a9dAee185e0c2ad89891b56";
const COLLATERAL_JOIN_FACTORY = "0xfE7987b1Ee45a8d592B15e8E924d50BFC8536143";
const HAI = "0x10398AbC267496E49106B07dd6BE13364D10dC71";
const FROM_BLOCK = 116055146;

const ABI = {
  collateralList:
    "function collateralList() view returns (bytes32[])",
  taxSingleOutcome:
    "function taxSingleOutcome(bytes32) view returns (uint256 newlyAccumulatedRate, int256 deltaRate)",
  cData:
    "function cData(bytes32) view returns (uint256 debtAmount, uint256 lockedAmount, uint256 accumulatedRate, uint256 safetyPrice, uint256 liquidationPrice)",
  liqCParams:
    "function cParams(bytes32) view returns (address collateralAuctionHouse, uint256 liquidationPenalty, uint256 liquidationQuantity)",
  deployCollateralJoin:
    "event DeployCollateralJoin(bytes32 indexed _cType, address indexed _collateral, address indexed _collateralJoin)",
  buyCollateral:
    "event BuyCollateral(uint256 indexed _id, address _bidder, uint256 _blockTimestamp, uint256 _raisedAmount, uint256 _soldAmount)",
  liquidate:
    "event Liquidate(bytes32 indexed _cType, address indexed _safe, uint256 _collateralAmount, uint256 _debtAmount, uint256 _amountToRaise, address _collateralAuctioneer, uint256 _auctionId)",
};

const RAY = 10n ** 27n;
const WAD = 10n ** 18n;
const key = (token: string) => `${CHAIN.OPTIMISM}:${token}`;
const auctionKey = (auctioneer: string, id: any) =>
  `${auctioneer.toLowerCase()}:${id}`;

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi, getLogs } = options;
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const collateralTypes: string[] = await toApi.call({
    target: TAX_COLLECTOR,
    abi: ABI.collateralList,
  });

  // Stability fees: SAFEEngine.debtAmount × Δ(taxSingleOutcome.newlyAccumulatedRate) / RAY
  const [startOutcome, endOutcome, debtData, liqParams, joinLogs] =
    await Promise.all([
      fromApi.multiCall({
        target: TAX_COLLECTOR,
        abi: ABI.taxSingleOutcome,
        calls: collateralTypes,
        permitFailure: true,
      }),
      toApi.multiCall({
        target: TAX_COLLECTOR,
        abi: ABI.taxSingleOutcome,
        calls: collateralTypes,
        permitFailure: true,
      }),
      toApi.multiCall({
        target: SAFE_ENGINE,
        abi: ABI.cData,
        calls: collateralTypes,
        permitFailure: true,
      }),
      toApi.multiCall({
        target: LIQUIDATION_ENGINE,
        abi: ABI.liqCParams,
        calls: collateralTypes,
        permitFailure: true,
      }),
      getLogs({
        target: COLLATERAL_JOIN_FACTORY,
        eventAbi: ABI.deployCollateralJoin,
        fromBlock: FROM_BLOCK,
        cacheInCloud: true,
      }),
    ]);

  // Build cType (bytes32 hex), collateral token address map from join-deploy events
  const cTypeToToken: Record<string, string> = {};
  for (const log of joinLogs) {
    cTypeToToken[String(log._cType).toLowerCase()] = String(log._collateral).toLowerCase();
  }

  for (let i = 0; i < collateralTypes.length; i++) {
    if (!startOutcome[i] || !endOutcome[i] || !debtData[i]) continue;
    const debt = BigInt(debtData[i].debtAmount);
    const deltaRate =
      BigInt(endOutcome[i].newlyAccumulatedRate) -
      BigInt(startOutcome[i].newlyAccumulatedRate);
    if (debt === 0n || deltaRate <= 0n) continue;
    const fee = (debt * deltaRate) / RAY; // [wad]
    dailyFees.add(HAI, fee, METRIC.BORROW_INTEREST);
    dailyRevenue.add(HAI, fee, METRIC.BORROW_INTEREST);
  }

  // Liquidation penalties and yield
  const auctionHouses: string[] = [];
  const houseInfo: Record<string, { penalty: bigint; token?: string }> = {};
  const penaltyByCType: Record<string, bigint> = {};
  for (let i = 0; i < collateralTypes.length; i++) {
    if (!liqParams[i]) continue;
    const penalty = BigInt(liqParams[i].liquidationPenalty);
    if (penalty <= WAD) continue;
    const house = liqParams[i].collateralAuctionHouse.toLowerCase();
    auctionHouses.push(house);
    houseInfo[house] = { penalty, token: cTypeToToken[collateralTypes[i].toLowerCase()] };
    penaltyByCType[collateralTypes[i].toLowerCase()] = penalty;
  }

  if (!auctionHouses.length) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  }

  const [liquidateLogs, allBuysRaw] = await Promise.all([
    getLogs({
      target: LIQUIDATION_ENGINE,
      eventAbi: ABI.liquidate,
      fromBlock: FROM_BLOCK,
      toBlock,
      entireLog: true,
      parseLog: true,
      cacheInCloud: true,
    }),
    getLogs({
      targets: auctionHouses,
      eventAbi: ABI.buyCollateral,
      fromBlock: FROM_BLOCK,
      toBlock,
      entireLog: true,
      parseLog: true,
      cacheInCloud: true,
    }),
  ]);

  // Map each auction's total raised debt ceiling (before penalty) from its Liquidate event
  const debtValueByAuction = new Map<string, bigint>();
  for (const log of liquidateLogs) {
    const cTypeLower = String(log.args._cType).toLowerCase();
    const penalty = penaltyByCType[cTypeLower];
    if (!penalty || penalty <= WAD) continue;
    // amountToRaise includes penalty
    const debtValue = (BigInt(log.args._amountToRaise) * WAD) / penalty;
    debtValueByAuction.set(
      auctionKey(log.args._collateralAuctioneer, log.args._auctionId),
      debtValue
    );
  }

  const allBuys: any[] = [...allBuysRaw];
  allBuys.sort(
    (a: any, b: any) =>
      a.blockNumber - b.blockNumber || a.logIndex - b.logIndex
  );

  // Track cumulative HAI raised per auction to compute when/how much penalty is realized
  const paidByAuction = new Map<string, bigint>();
  const periodBuys: { token?: string; raised: bigint; sold: bigint; ts: number }[] = [];

  for (const log of allBuys) {
    const house = log.address.toLowerCase();
    const akey = auctionKey(house, log.args._id);
    const raisedWad = BigInt(log.args._raisedAmount);
    const raisedRad = raisedWad * RAY;
    const before = paidByAuction.get(akey) || 0n;
    const after = before + raisedRad;
    paidByAuction.set(akey, after);

    const inPeriod = log.blockNumber >= fromBlock && log.blockNumber <= toBlock;

    // Liquidation penalty: HAI raised above the bare debt value for this buy
    const debtValue = debtValueByAuction.get(akey);
    if (debtValue !== undefined && inPeriod) {
      const coveredBefore = before < debtValue ? before : debtValue;
      const coveredAfter = after < debtValue ? after : debtValue;
      const penaltyRad = raisedRad - (coveredAfter - coveredBefore);
      if (penaltyRad > 0n) {
        const penaltyWad = penaltyRad / RAY;
        dailyFees.add(HAI, penaltyWad, METRIC.LIQUIDATION_FEES);
        dailyRevenue.add(HAI, penaltyWad, METRIC.LIQUIDATION_FEES);
      }
    }

    if (inPeriod) {
      periodBuys.push({
        token: houseInfo[house]?.token,
        raised: raisedWad,
        sold: BigInt(log.args._soldAmount),
        ts: Number(log.args._blockTimestamp),
      });
    }
  }

  // Liquidation yield: discount earned by auction buyers (collateral value − HAI paid)
  const collateralKeys = [
    ...new Set(periodBuys.map((b) => b.token).filter(Boolean)),
  ].map((t) => key(t!));

  if (collateralKeys.length > 0) {
    const uniqueTs = [...new Set(periodBuys.map((b) => b.ts))];
    const pricesByTs: Record<number, any> = {};
    await PromisePool.withConcurrency(5)
      .for(uniqueTs)
      .process(async (ts) => {
        pricesByTs[ts] = await sdk.coins.getPrices(
          [key(HAI), ...collateralKeys],
          ts
        );
      });

    for (const b of periodBuys) {
      if (!b.token) continue;
      const prices = pricesByTs[b.ts];
      const collateralPrice = prices[key(b.token)]?.price;
      const haiPrice = prices[key(HAI)]?.price;
      if (!collateralPrice || !haiPrice) continue;
      const discountUSD =
        (Number(b.sold) / 1e18) * collateralPrice -
        (Number(b.raised) / 1e18) * haiPrice;
      if (discountUSD > 0) {
        dailyFees.addUSDValue(discountUSD, "Liquidation Yield");
        dailySupplySideRevenue.addUSDValue(discountUSD, "Liquidation Yield");
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: "2024-03-07",
  methodology: {
    Fees:
      "Stability fees paid by HAI borrowers on their CDP debt, liquidation penalties charged when undercollateralized vaults are liquidated, and liquidation yield earned by buyers of seized collateral.",
    Revenue:
      "Stability fees and liquidation penalties captured by protocol controlled receivers.",
    ProtocolRevenue:
      "Stability fees and liquidation penalties captured by protocol controlled receivers.",
    SupplySideRevenue:
      "Liquidation yield earned by auction buyers and Stability Pool (sHAI) depositors who collect liquidation profits through the Automated Liquidation Profit Sharing system.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]:
        "Stability fees paid by HAI borrowers on their collateralized debt positions.",
      [METRIC.LIQUIDATION_FEES]:
        "Liquidation penalties charged on undercollateralized vaults when their collateral is auctioned to cover outstanding debt.",
      ["Liquidation Yield"]:
        "Discount on seized collateral earned by buyers who pay HAI to acquire liquidated collateral at below market value.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]:
        "Stability fees captured by protocol controlled receivers.",
      [METRIC.LIQUIDATION_FEES]:
        "Liquidation penalties sent to the protocol surplus buffer.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]:
        "Stability fees captured by protocol controlled receivers.",
      [METRIC.LIQUIDATION_FEES]:
        "Liquidation penalties sent to the protocol surplus buffer.",
    },
    SupplySideRevenue: {
      ["Liquidation Yield"]:
        "Liquidation profits collected by auction buyers and Stability Pool depositors who receive liquidated collateral at a discount.",
    },
  },
};

export default adapter;
