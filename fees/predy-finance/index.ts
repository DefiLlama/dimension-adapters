import * as sdk from "@defillama/sdk";
import ADDRESSES from '../../helpers/coreAssets.json'
import BigNumber from "bignumber.js";
import { gql, request } from "graphql-request";
import { FetchOptions, type BreakdownAdapter, type ChainEndpoints } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { formatTimestampAsDate, getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getPrices } from "../../utils/prices";


const ControllerAbi = ["function getAsset(uint256 _id) view returns ((uint256 id, uint256 pairGroupId, (address token, address supplyTokenAddress, (uint256 totalCompoundDeposited, uint256 totalNormalDeposited, uint256 totalNormalBorrowed, uint256 assetScaler, uint256 assetGrowth, uint256 debtGrowth) tokenStatus, (uint256 baseRate, uint256 kinkRate, uint256 slope1, uint256 slope2) irmParams) stablePool, (address token, address supplyTokenAddress, (uint256 totalCompoundDeposited, uint256 totalNormalDeposited, uint256 totalNormalBorrowed, uint256 assetScaler, uint256 assetGrowth, uint256 debtGrowth) tokenStatus, (uint256 baseRate, uint256 kinkRate, uint256 slope1, uint256 slope2) irmParams) underlyingPool, (uint256 riskRatio, int24 rangeSize, int24 rebalanceThreshold) riskParams, (address uniswapPool, int24 tickLower, int24 tickUpper, uint64 numRebalance, uint256 totalAmount, uint256 borrowedAmount, uint256 lastRebalanceTotalSquartAmount, uint256 lastFee0Growth, uint256 lastFee1Growth, uint256 borrowPremium0Growth, uint256 borrowPremium1Growth, uint256 fee0Growth, uint256 fee1Growth, (int256 positionAmount, uint256 lastFeeGrowth) rebalancePositionUnderlying, (int256 positionAmount, uint256 lastFeeGrowth) rebalancePositionStable, int256 rebalanceFeeGrowthUnderlying, int256 rebalanceFeeGrowthStable) sqrtAssetStatus, bool isMarginZero, bool isIsolatedMode, uint256 lastUpdateTimestamp))"]

const v3endpoints = {
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('4ZDgpHaNhFWKFvUZ9ND4hsWjsz3vR2osCZyrkun3GghM'),
};

const v320endpoints = {
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('5icuXT29ipuwqJBF1qux8eA1zskVazyYNq9NzQvoB6eS'),
};

const v5endpoints: Record<string, string> = {
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('GxfTCbMfhaBSJaXHj88Ja1iVG9CXwGWhVQsQ8YA7oLdo'),
};

const USDC_DECIMAL = 1e6;
const ETH_DECIMAL = 1e18;
const ERC20_DECIMAL = 1e18;
const WBTC_DECIMAL = 1e8;
const GYEN_DECIMAL = 1e6;
const DIVISOR = 1e18;

// Set decimals for each token
let decimalByAddress: { [key: string]: number } = {
  [ADDRESSES.arbitrum.USDC]: USDC_DECIMAL,
  [ADDRESSES.arbitrum.WETH]: ETH_DECIMAL,
  [ADDRESSES.arbitrum.WBTC]: WBTC_DECIMAL,
  "0x589d35656641d6aB57A545F08cf473eCD9B6D5F7": GYEN_DECIMAL,
};

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dayTime = getTimestampAtStartOfDayUTC(timestamp);
  const graphUrl = v5endpoints[options.chain];

  // ETH oracle price
  const ethAddress = "ethereum:" + ADDRESSES.null;
  const ethPrice = (await getPrices([ethAddress], dayTime))[ethAddress]
    .price;

  // Set date string params which are used by queries
  const todaysDateParts = formatTimestampAsDate(dayTime.toString()).split(
    "/"
  );
  const todaysDateString = `${todaysDateParts[2]}-${todaysDateParts[1]}-${todaysDateParts[0]}`;
  const previousDateUTC = dayTime - 60 * 60 * 24;
  const previousDateParts = formatTimestampAsDate(
    previousDateUTC.toString()
  ).split("/");
  const previousDateString = `${previousDateParts[2]}-${previousDateParts[1]}-${previousDateParts[0]}`;

  /* Set daily fees and daily revenue */
  let dailyFees: BigNumber | undefined = undefined;
  let dailyRevenue: BigNumber | undefined = undefined;
  let dailySupplySideRevenue: BigNumber | undefined = undefined;

  if (graphUrl === v3endpoints[CHAIN.ARBITRUM]) {
    dailyFees = await v3DailyFees(todaysDateString, graphUrl, ethPrice);
    dailyRevenue = await v3DailyRevenue(
      todaysDateString,
      previousDateString,
      graphUrl,
      ethPrice
    );
    dailySupplySideRevenue = dailyFees && dailyRevenue ? dailyFees.minus(dailyRevenue) : undefined;
  } else if (graphUrl === v320endpoints[CHAIN.ARBITRUM]) {
    [dailyFees, dailySupplySideRevenue] = await v320DailyFeesAndSupplySideRevenue(
      todaysDateString,
      graphUrl,
      ethPrice,
    );
    dailyRevenue = await v3DailyRevenue(
      todaysDateString,
      previousDateString,
      graphUrl,
      ethPrice,
      true
    );
  } else if (graphUrl === v5endpoints[CHAIN.ARBITRUM]) {
    dailyFees = await v5DailyFees(todaysDateString, graphUrl, options);
    dailyRevenue = undefined;
    dailySupplySideRevenue = undefined;
  }

  return {
    timestamp,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  } as any
};

const v3DailyFees = async (
  todaysDateString: string,
  graphUrl: string,
  ethPrice: number,
  v320: boolean = false
): Promise<BigNumber | undefined> => {
  const controllerAddress = "0x68a154fb3e8ff6e4da10ecd54def25d9149ddbde";

  const todaysEntityId = v320
    ? controllerAddress + "-" + todaysDateString
    : todaysDateString;
  const divisor = v320 ? 1e24 : 1;

  // Get daily LPT and token revenue
  let query;
  query = gql`
      {
          lprevenueDaily(id: "${todaysEntityId}") {
            id
            fee0
            fee1
            premiumSupply
            premiumBorrow
            supplyInterest0
            supplyInterest1
            borrowInterest0
            borrowInterest1
            updatedAt
          }
      }
      `;
  const result = await request(graphUrl, query);
  let dailyFees: undefined | BigNumber = undefined;
  let tokenRevenue: undefined | BigNumber = undefined;
  if (result.lprevenueDaily) {
    // Set LPT revenue
    const fee0 = new BigNumber(result.lprevenueDaily.fee0)
      .times(ethPrice)
      .div(1e12);
    const fee1 = new BigNumber(result.lprevenueDaily.fee1);
    const premiumSupply = new BigNumber(result.lprevenueDaily.premiumSupply);
    const lptRevenue = fee0
      .plus(fee1)
      .plus(premiumSupply);
    // Set token revenue
    const supplyInterest0 = new BigNumber(result.lprevenueDaily.supplyInterest0)
      .times(ethPrice)
      .div(1e12);
    const supplyInterest1 = new BigNumber(
      result.lprevenueDaily.supplyInterest1
    );

    tokenRevenue = supplyInterest0.plus(supplyInterest1);

    dailyFees = (lptRevenue.plus(tokenRevenue)).div(divisor);
    return dailyFees;
  }
  return BigNumber('0');
};

const v320DailyFeesAndSupplySideRevenue = async (
  todaysDateString: string,
  graphUrl: string,
  ethPrice: number,
): Promise<[BigNumber | undefined, BigNumber | undefined]> => {
  const controllerAddress = "0x68a154fb3e8ff6e4da10ecd54def25d9149ddbde";

  const todaysEntityId = controllerAddress + "-" + todaysDateString;

  // Get daily LPT and token revenue
  let query;
  query = gql`
      {
          lprevenueDaily(id: "${todaysEntityId}") {
            id
            fee0
            fee1
            premiumSupply
            premiumBorrow
            supplyInterest0
            supplyInterest1
            borrowInterest0
            borrowInterest1
            updatedAt
          }
      }
      `;
  const result = await request(graphUrl, query);
  let usersPaymentFees: undefined | BigNumber = undefined;
  let lptRevenue: undefined | BigNumber = undefined;
  if (result.lprevenueDaily) {
    // Calculate user payment fees
    const premiumBorrow = new BigNumber(result.lprevenueDaily.premiumBorrow)
      .div(USDC_DECIMAL)
      .div(DIVISOR);

    // USDC
    const borrowInterest0 = new BigNumber(result.lprevenueDaily.borrowInterest0).div(USDC_DECIMAL).div(DIVISOR);

    // ETH
    const borrowInterest1 = new BigNumber(result.lprevenueDaily.borrowInterest1)
      .times(ethPrice)
      .div(ETH_DECIMAL)
      .div(DIVISOR);

    usersPaymentFees = premiumBorrow.plus(borrowInterest0).plus(borrowInterest1);

    // Calculate LPT revenue
    const premiumSupply = new BigNumber(result.lprevenueDaily.premiumSupply).div(USDC_DECIMAL).div(DIVISOR);

    // ETH
    const fee0 = new BigNumber(result.lprevenueDaily.fee0)
      .times(ethPrice)
      .div(ETH_DECIMAL)
      .div(DIVISOR);

    // USDC
    const fee1 = new BigNumber(result.lprevenueDaily.fee1).div(USDC_DECIMAL).div(DIVISOR);

    // USDC
    const supplyInterest0 = new BigNumber(result.lprevenueDaily.supplyInterest0)
      .div(USDC_DECIMAL)
      .div(DIVISOR);

    // ETH
    const supplyInterest1 = new BigNumber(result.lprevenueDaily.supplyInterest1)
      .times(ethPrice)
      .div(ETH_DECIMAL)
      .div(DIVISOR);

    lptRevenue = premiumSupply
      .plus(fee0)
      .plus(fee1)
      .plus(supplyInterest0)
      .plus(supplyInterest1);

    return [usersPaymentFees, lptRevenue];
  }
  return [BigNumber('0'), BigNumber('0')];
};

const v5DailyFees = async (
  todaysDateString: string,
  graphUrl: string,
  options: FetchOptions,
): Promise<BigNumber | undefined> => {

  // Get latest pair number
  let query;
  query = gql`
    {
      pairEntities(first: 1, orderBy: createdAt, orderDirection: desc) {
        id
      }
    }
  `;
  let result;
  result = await request(graphUrl, query);

  if (!result.pairEntities[0].id) {
    throw new Error(`No pair entities found`);
  }
  const latestPairNumber = result.pairEntities[0].id;

  const controllerAddress = "0x06a61e55d4d4659b1a23c0f20aedfc013c489829";
  const calls: any = []
  for (let i = 1; i <= latestPairNumber; i++)
    calls.push(i)

  const queryRes = await options.api.multiCall({ abi: ControllerAbi[0], calls, target: controllerAddress, })


  let usersPaymentFees: BigNumber = BigNumber(0);

  // Retrieve daily fees for each pair
  for (let i = 1; i <= latestPairNumber; i++) {
    const pairId = i;
    const pairStatus = queryRes[i - 1]

    // Each pair has two tokens, stableToken and underlyingToken.
    // Several tokens have different decimals, we need to set decimals for each token.
    const stableTokenAddress: string = pairStatus.stablePool.token;
    const stableDecimal = decimalByAddress[stableTokenAddress] ?? ERC20_DECIMAL;

    const underlyingTokenAddress: string = pairStatus.underlyingPool.token;
    const underlyingDecimal =
      decimalByAddress[underlyingTokenAddress] ?? ERC20_DECIMAL;

    // Set fee0Decimal and fee1Decimal, if isMergeZero is true then token0 is stableToken
    const isMarginZero = pairStatus.isMarginZero;
    const fee0Decimal = isMarginZero ? stableDecimal : underlyingDecimal;
    const fee1Decimal = isMarginZero ? underlyingDecimal : stableDecimal;

    // Set todaysEntityId, for example: 0x06a61e55d4d4659b1a23c0f20aedfc013c489829-1-2023-07-31
    const todaysEntityId =
      controllerAddress + "-" + pairId + "-" + todaysDateString;

    // Get daily fee
    query = gql`
      {
          feeDaily(id: "${todaysEntityId}") {
            id
            supplyStableFee
            supplyUnderlyingFee
            borrowStableFee
            borrowUnderlyingFee
            supplySqrtFee0
            supplySqrtFee1
            borrowSqrtFee0
            borrowSqrtFee1
            supplyStableInterestGrowth
            supplyUnderlyingInterestGrowth
            borrowStableInterestGrowth
            borrowUnderlyingInterestGrowth
            updatedAt
          }
      }
      `;
    result = await request(graphUrl, query);

    if (result.feeDaily) {
      const feeDaily = result.feeDaily;
      // Calculate user payment fees
      const borrowStableFee = new BigNumber(feeDaily.borrowStableFee).div(
        stableDecimal
      );
      const borrowUnderlyingFee = new BigNumber(
        feeDaily.borrowUnderlyingFee
      ).div(underlyingDecimal);
      const borrowSqrtFee0 = new BigNumber(feeDaily.borrowSqrtFee0).div(
        fee0Decimal
      );
      const borrowSqrtFee1 = new BigNumber(feeDaily.borrowSqrtFee1).div(
        fee1Decimal
      );

      const borrowPremium = borrowStableFee
        .plus(borrowUnderlyingFee)
        .plus(borrowSqrtFee0)
        .plus(borrowSqrtFee1);
      usersPaymentFees = usersPaymentFees.plus(borrowPremium);
    }
  }

  return usersPaymentFees;
}
const v3DailyRevenue = async (
  todaysDateString: string,
  previousDateString: string,
  graphUrl: string,
  ethPrice: number,
  v320: boolean = false
): Promise<BigNumber | undefined> => {
  const controllerAddress = "0x68a154fb3e8ff6e4da10ecd54def25d9149ddbde";

  const todaysEntityId = v320
    ? controllerAddress + "-" + todaysDateString
    : todaysDateString;

  const yesterdaysEntityId = v320
    ? controllerAddress + "-" + previousDateString
    : previousDateString;

  // Get accumulatedProtocolFees for today and previous day
  let query;
  query = gql`
      {
          accumulatedProtocolFeeDaily(id: "${todaysEntityId}") {
              accumulatedProtocolFee0
              accumulatedProtocolFee1
          }
      }
      `;
  const todayResults = await request(graphUrl, query);

  query = gql`
      {
        accumulatedProtocolFeeDaily(id: "${yesterdaysEntityId}") {
              accumulatedProtocolFee0
              accumulatedProtocolFee1
            }
          }
          `;

  const previousDayResults = await request(graphUrl, query);
  let dailyRevenue: undefined | BigNumber = undefined;
  if (
    todayResults.accumulatedProtocolFeeDaily &&
    previousDayResults.accumulatedProtocolFeeDaily
  ) {
    let dailyFee0 = new BigNumber(0);
    let dailyFee1 = new BigNumber(0);
    if (v320) {
      // USDC
      dailyFee0 = new BigNumber(
        todayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee0 -
        previousDayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee0
      ).div(USDC_DECIMAL);
      // ETH
      dailyFee1 = new BigNumber(
        todayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee1 -
        previousDayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee1
      )
        .times(ethPrice)
        .div(ETH_DECIMAL);
    } else {
      // ETH
      dailyFee0 = new BigNumber(
        todayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee0 -
        previousDayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee0
      )
        .times(ethPrice)
        .div(ETH_DECIMAL);
      // USDC
      dailyFee1 = new BigNumber(
        todayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee1 -
        previousDayResults.accumulatedProtocolFeeDaily.accumulatedProtocolFee1
      );
    }
    dailyRevenue = dailyFee0.plus(dailyFee1);
    return dailyRevenue;
  }
  return BigNumber('0');
};

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v3: {
      [CHAIN.ARBITRUM]: { fetch: async () => ({}), deadFrom: "2023-08-02", },
    },
    v320: {
      [CHAIN.ARBITRUM]: { fetch: async () => ({}), deadFrom: "2023-08-02", },
    },
    v5: {
      [CHAIN.ARBITRUM]: {
        fetch,
        start: '2023-07-04',
      },
    },
  },
};

export default adapter;
