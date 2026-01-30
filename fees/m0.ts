import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

const methodology = {
  Fees: 'Total minter fees, penalty fees paid by borrowers, auction proceeds and failed proposals fee',
  Revenue: 'Total fees earned by distribution vault(Excess yields, auction proceeds and failed proposals fee',
  SupplySideRevenue: 'Yields earned by whitelisted earners',
  HoldersRevenue: 'All the revenue goes to ZERO governanace token holders',
  ProtocolRevenue: 'No Protocol revenue',
}

const breakdownMethodology = {
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Excess yields due to rounding, interest rate spreads',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Treasury yields earned from collateral assets',
  },
  HoldersRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Excess yields due to rounding, interest rate spreads',
  }
}
const TokenM = '0x866a2bf4e572cbcf37d5071a7a58503bfb36be1b';
const DistributionVault = '0xd7298f620B0F752Cf41BD818a16C756d9dCAA34f';

const ContractAbis = {
  earnerRate: 'uint32:earnerRate',
  totalEarningSupply: 'function totalEarningSupply() external view returns (uint240)'
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailySupplySideRevenue = options.createBalances();
  const dailyFees = options.createBalances();

  const totalEarningSupply = await options.api.call({
    abi: ContractAbis.totalEarningSupply,
    target: TokenM,
  });

  const earnerRate = await options.api.call({
    abi: ContractAbis.earnerRate,
    target: TokenM
  });

  const YEAR = 365 * 24 * 60 * 60
  const timeframe = options.fromTimestamp && options.toTimestamp ? (options.toTimestamp - options.fromTimestamp) : 24 * 60 * 60
  const dailyYield = (totalEarningSupply * (earnerRate / 100) * (timeframe / YEAR)) / 100;
  dailySupplySideRevenue.add(TokenM, dailyYield, METRIC.ASSETS_YIELDS);
  dailyFees.add(TokenM, dailyYield, METRIC.ASSETS_YIELDS);

  const dailyHoldersRevenue = await addTokensReceived({
    options,
    token: TokenM,
    target: DistributionVault,
  });

  dailyFees.add(dailyHoldersRevenue)

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-05-31',
    },
  },
  methodology,
  breakdownMethodology,
  version: 2,
};

export default adapter;
