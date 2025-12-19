import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// PufferVault contracts and accountants
// Source: https://docs.puffer.fi/yield/deployments/deployed-contracts
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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Get data at start of day (permitFailure: vaults deployed at different times)
  const suppliesStart = await options.fromApi.multiCall({
    abi: abis.totalSupply,
    calls: vaults,
    permitFailure: true,
  });
  const ratesStart = await options.fromApi.multiCall({
    abi: abis.getRate,
    calls: accountants,
    permitFailure: true,
  });

  // Get data at end of day
  const suppliesEnd = await options.toApi.multiCall({
    abi: abis.totalSupply,
    calls: vaults,
    permitFailure: true,
  });
  const ratesEnd = await options.toApi.multiCall({
    abi: abis.getRate,
    calls: accountants,
    permitFailure: true,
  });

  // Get base tokens
  const bases = await options.toApi.multiCall({
    abi: abis.base,
    calls: accountants,
    permitFailure: true,
  });

  for (let i = 0; i < vaults.length; i++) {
    const supplyStart = suppliesStart[i];
    const supplyEnd = suppliesEnd[i];
    const rateStart = ratesStart[i];
    const rateEnd = ratesEnd[i];
    const base = bases[i];

    // Skip if vault doesn't exist yet
    if (!supplyStart || !supplyEnd || !rateStart || !rateEnd || !base) {
      continue;
    }

    // Calculate yield from exchange rate increase (isolates actual yield from deposits/withdrawals)
    const avgSupply = (BigInt(supplyStart) + BigInt(supplyEnd)) / 2n;
    const rateDiff = BigInt(rateEnd) - BigInt(rateStart);
    const denominator = BigInt(Math.pow(10, String(rateEnd).length - 1));

    const totalYield = (avgSupply * rateDiff) / denominator;

    if (totalYield > 0n) {
      dailyFees.add(base, totalYield);

      // Protocol revenue: 10% performance fee on restaking rewards + 1% instant withdrawal fees
      const estimatedRevenue = (totalYield * 10n) / 100n;
      dailyRevenue.add(base, estimatedRevenue);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

// Fee structure sources:
// - 1% instant withdrawal fee (goes to protocol treasury): https://docs.puffer.fi/yield/stakers/withdraw
// - 10% performance fee on restaking rewards: https://github.com/PufferFinance/puffer-contracts
// - 0% fee on standard withdrawals (2-step, takes up to 14 days): https://docs.puffer.fi/yield/stakers/withdraw
const methodology = {
  Fees: 'Total yields generated from staking rewards and restaking rewards. Calculated from exchange rate increases in Puffer Vaults (tracks getRate() changes, not totalAssets to avoid counting deposits as yield).',
  Revenue:
    'Protocol revenue from performance fees (10% on restaking rewards) and instant withdrawal fees (1%).',
  ProtocolRevenue:
    'Same as Revenue - protocol captures performance fees and instant withdrawal fees directed to treasury.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-01-31',
    },
  },
  methodology,
};

export default adapter;
