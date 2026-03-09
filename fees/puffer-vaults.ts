import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const vaults = [
  '0x196ead472583bc1e9af7a05f860d9857e1bd3dcc',
  '0x82c40e07277eBb92935f79cE92268F80dDc7caB4',
  '0x170d847a8320f3b6a77ee15b0cae430e3ec933a0',
];

const accountants = [
  '0xa9fb7e2922216debe3fd5e1bbe7591ee446dc21c',
  '0xe0bDb7b9225A2CeB42998dc2E51D4D3CDeb7e3Be',
  '0x2afb28b0561d99b5e00829ec2ef54946a00a35f7',
];

const abis = {
  totalSupply: 'uint256:totalSupply',
  getRate: 'uint256:getRate',
  base: 'address:base',
};

const PERFORMANCE_FEE_RATIO = 0.1;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [suppliesStart, ratesStart] = await Promise.all([
    options.fromApi.multiCall({
      abi: abis.totalSupply,
      calls: vaults,
      permitFailure: true,
    }),
    options.fromApi.multiCall({
      abi: abis.getRate,
      calls: accountants,
      permitFailure: true,
    }),
  ]);

  const [suppliesEnd, ratesEnd, bases] = await Promise.all([
    options.toApi.multiCall({
      abi: abis.totalSupply,
      calls: vaults,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: abis.getRate,
      calls: accountants,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: abis.base,
      calls: accountants,
      permitFailure: true,
    }),
  ]);

  for (let i = 0; i < vaults.length; i++) {
    const supplyStart = suppliesStart[i];
    const supplyEnd = suppliesEnd[i];
    const rateStart = ratesStart[i];
    const rateEnd = ratesEnd[i];
    const base = bases[i];

    if (!supplyStart || !supplyEnd || !rateStart || !rateEnd || !base) {
      continue;
    }

    const rateDiff = BigInt(rateEnd) - BigInt(rateStart);
    const avgSupply = (BigInt(supplyStart) + BigInt(supplyEnd)) / 2n;
    const denominator = BigInt(Math.pow(10, String(rateEnd).length - 1));
    const totalYield = (avgSupply * rateDiff) / denominator;
    dailyFees.add(base, totalYield, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.add(base, totalYield, METRIC.STAKING_REWARDS);

    const protocolRevenue = (totalYield * BigInt(Math.floor(PERFORMANCE_FEE_RATIO * 1e18))) / BigInt(1e18);
    dailyRevenue.add(base, protocolRevenue, METRIC.PERFORMANCE_FEES);
    dailySupplySideRevenue.add(base, -1 * Number(protocolRevenue));
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: 'Vault strategy staking rewards.',
  Revenue: '10% performance fee on restaking rewards.',
  ProtocolRevenue: '10% of performance fees collected by the protocol.',
  SupplySideRevenue: 'fees earned by the supply side (restakers).',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Vault Strategy Staking Rewards',
    [METRIC.PERFORMANCE_FEES]: '10% performance fee collected by the protocol'
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: '10% performance fee collected by the protocol'
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2024-01-31',
  allowNegativeValue: true, // Allow negative value as vault token price can fluctuate
  methodology,
  breakdownMethodology,
};

export default adapter;
