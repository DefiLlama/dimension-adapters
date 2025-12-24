import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

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

    // Yield derived purely from exchange rate change
    const rateDiff = BigInt(rateEnd) - BigInt(rateStart);

    if (rateDiff <= 0n) {
      continue;
    }

    // Use average supply to reduce deposit/withdraw noise
    const avgSupply = (BigInt(supplyStart) + BigInt(supplyEnd)) / 2n;

    const denominator = BigInt(Math.pow(10, String(rateEnd).length - 1));

    const totalYield = (avgSupply * rateDiff) / denominator;

    if (totalYield <= 0n) {
      continue;
    }

    // Fees = total rewards earned by the vault
    dailyFees.add(base, totalYield);

    // Protocol revenue = 10% performance fee
    const protocolRevenue =
      (totalYield * BigInt(Math.floor(PERFORMANCE_FEE_RATIO * 1e18))) /
      BigInt(1e18);

    dailyRevenue.add(base, protocolRevenue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Fees are derived from changes in the vault exchange rate multiplied by the average vault supply. This isolates rewards from deposits and withdrawals and avoids using TVL deltas.',
  Revenue:
    'Protocol revenue consists of a 10% performance fee on restaking rewards.',
  ProtocolRevenue:
    'Same as Revenue. Rewards are synchronized on-chain in discrete updates, so daily values may appear lumpy rather than continuous.',
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
