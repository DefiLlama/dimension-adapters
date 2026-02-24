import * as sdk from "@defillama/sdk";
import ADDRESSES from '../helpers/coreAssets.json'
import BigNumber from "bignumber.js";
import { gql, request } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { formatTimestampAsDate, getTimestampAtStartOfDayUTC } from "../utils/date";

const ControllerAbi = ["function getAsset(uint256 _id) view returns ((uint256 id, uint256 pairGroupId, (address token, address supplyTokenAddress, (uint256 totalCompoundDeposited, uint256 totalNormalDeposited, uint256 totalNormalBorrowed, uint256 assetScaler, uint256 assetGrowth, uint256 debtGrowth) tokenStatus, (uint256 baseRate, uint256 kinkRate, uint256 slope1, uint256 slope2) irmParams) stablePool, (address token, address supplyTokenAddress, (uint256 totalCompoundDeposited, uint256 totalNormalDeposited, uint256 totalNormalBorrowed, uint256 assetScaler, uint256 assetGrowth, uint256 debtGrowth) tokenStatus, (uint256 baseRate, uint256 kinkRate, uint256 slope1, uint256 slope2) irmParams) underlyingPool, (uint256 riskRatio, int24 rangeSize, int24 rebalanceThreshold) riskParams, (address uniswapPool, int24 tickLower, int24 tickUpper, uint64 numRebalance, uint256 totalAmount, uint256 borrowedAmount, uint256 lastRebalanceTotalSquartAmount, uint256 lastFee0Growth, uint256 lastFee1Growth, uint256 borrowPremium0Growth, uint256 borrowPremium1Growth, uint256 fee0Growth, uint256 fee1Growth, (int256 positionAmount, uint256 lastFeeGrowth) rebalancePositionUnderlying, (int256 positionAmount, uint256 lastFeeGrowth) rebalancePositionStable, int256 rebalanceFeeGrowthUnderlying, int256 rebalanceFeeGrowthStable) sqrtAssetStatus, bool isMarginZero, bool isIsolatedMode, uint256 lastUpdateTimestamp))"]

const v5endpoints: Record<string, string> = {
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('GxfTCbMfhaBSJaXHj88Ja1iVG9CXwGWhVQsQ8YA7oLdo'),
};

const USDC_DECIMAL = 1e6;
const ETH_DECIMAL = 1e18;
const ERC20_DECIMAL = 1e18;
const WBTC_DECIMAL = 1e8;
const GYEN_DECIMAL = 1e6;

// Set decimals for each token
let decimalByAddress: { [key: string]: number } = {
  [ADDRESSES.arbitrum.USDC]: USDC_DECIMAL,
  [ADDRESSES.arbitrum.WETH]: ETH_DECIMAL,
  [ADDRESSES.arbitrum.WBTC]: WBTC_DECIMAL,
  "0x589d35656641d6aB57A545F08cf473eCD9B6D5F7": GYEN_DECIMAL,
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

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dayTime = getTimestampAtStartOfDayUTC(timestamp);
  const graphUrl = v5endpoints[options.chain];

  // Set date string params which are used by queries
  const todaysDateParts = formatTimestampAsDate(dayTime.toString()).split("/");
  const todaysDateString = `${todaysDateParts[2]}-${todaysDateParts[1]}-${todaysDateParts[0]}`;

  const dailyFees = await v5DailyFees(todaysDateString, graphUrl, options);
  const dailyRevenue = undefined;
  const dailySupplySideRevenue = undefined;

  return {
    timestamp,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  } as any
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-07-04',
    },
  },
};

export default adapter;
