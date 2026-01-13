import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SSV_COINGECKO_ID = "ssv-network";
const SSV_NETWORK_CONTRACT = "0xafE830B6Ee262ba11cce5F32fDCd760FFE6a66e4";

const weiToSSV = (amount: string): number => {
  return Number(amount || "0") / 1e18;
};

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const { createBalances } = options;

  // Initialize all balance objects
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Get network fee and earnings at the start and end of the period
  const [startNetworkFee, startNetworkEarnings, endNetworkFee, endNetworkEarnings] = await Promise.all([
    options.fromApi.call({
      target: SSV_NETWORK_CONTRACT,
      abi: "function getNetworkFee() view returns (uint256)",
    }),
    options.fromApi.call({
      target: SSV_NETWORK_CONTRACT,
      abi: "function getNetworkEarnings() view returns (uint256)",
    }),
    options.toApi.call({
      target: SSV_NETWORK_CONTRACT,
      abi: "function getNetworkFee() view returns (uint256)",
    }),
    options.toApi.call({
      target: SSV_NETWORK_CONTRACT,
      abi: "function getNetworkEarnings() view returns (uint256)",
    }),
  ]);

  // Calculate daily increases
  const dailyNetworkFeeIncrease = Math.max(0, Number(endNetworkFee) - Number(startNetworkFee));
  const dailyNetworkEarningsIncrease = Math.max(0, Number(endNetworkEarnings) - Number(startNetworkEarnings));

  // Convert to SSV tokens
  const totalFees = weiToSSV(dailyNetworkFeeIncrease.toString());
  const networkRevenue = weiToSSV(dailyNetworkEarningsIncrease.toString());
  const operatorRevenue = Math.max(0, totalFees - networkRevenue); // Remaining goes to operators

  // Add to balances
  dailyFees.addCGToken(SSV_COINGECKO_ID, totalFees);
  dailyProtocolRevenue.addCGToken(SSV_COINGECKO_ID, networkRevenue);
  dailySupplySideRevenue.addCGToken(SSV_COINGECKO_ID, operatorRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  UserFees: "Fees paid by stakers for using SSV network validator services. These fees are paid in SSV tokens for distributed validator operations.",
  Fees: "Total network fees collected from validator operations, calculated as the daily increase in network fee accumulator.",
  Revenue: "Network earnings that go to the SSV DAO treasury, calculated as the daily increase in network earnings accumulator.",
  ProtocolRevenue: "Network earnings that go to the SSV DAO treasury, calculated as the daily increase in network earnings accumulator.",
  SupplySideRevenue: "Fees distributed to SSV node operators who provide the infrastructure and run the validator services, calculated as total fees minus network earnings.",
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-06-18', // Based on SSV mainnet launch
    },
  },
  methodology,
};

export default adapter;