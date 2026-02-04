import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SUPERFLUID_CONTRACT = "0x464C71f6c2F760DdA6093dCB91C24c39e5d6e18c";
const STREAM_ID = 100034;

const ABI = {
  getStream:  "function getStream(uint256 streamId) view returns (address sender, address recipient, uint256 deposit, address tokenAddress, uint256 startTime, uint256 stopTime, uint256 remainingBalance, uint256 ratePerSecond)"
}

const breakdownMethodology = {
  Fees: {
    'Superfluid Incentive Stream Payments': 'Daily fees calculated from the AAVE incentive stream rate distributed to AaveChan via a Superfluid constant flow agreement.',
  },
  Revenue: {
    'Incentive Stream Revenue': 'Daily revenue received by AaveChan from the AAVE Superfluid incentive stream.',
  },
};

const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const stream = await options.toApi.call({
    abi: ABI.getStream,
    target: SUPERFLUID_CONTRACT,
    params: [STREAM_ID]
  });

  const ratePerSecond = stream.ratePerSecond;
  const SECONDS_PER_DAY = 86400;
  const dailyRate = ratePerSecond * SECONDS_PER_DAY;

  dailyFees.add(stream.tokenAddress, dailyRate, 'Superfluid Incentive Stream Payments');
  dailyRevenue.add(stream.tokenAddress, dailyRate, 'Incentive Stream Revenue');

  return {
    dailyFees,
    dailyRevenue,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: "2023-01-01",
    }
  },
  version: 2,
  methodology: {
    Fees: "Incentive stream distribution via Superfluid.",
    Revenue: "Incentive stream distribution via Superfluid.",
  },
  breakdownMethodology,
}

export default adapter;
