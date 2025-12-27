import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';

const GETH_CONTRACT = '0x3802c218221390025bceabbad5d8c59f40eb74b8';
const SERVICE_FEE_RATE = 0.1; // 10% of rewards
const DEFAULT_APY = 0.03; // Fallback if API fails

const abis = {
  totalSupply: 'uint256:totalSupply',
};

interface IYield {
  apy?: number;
  apyBase?: number;
  apyMean30d?: number;
  project: string;
  symbol: string;
  chain: string;
}

// GETH does not expose on-chain reward or APY data.
// We use Lido stETH as an ETH staking benchmark via DefiLlama Yields.
async function fetchEthStakingAPY(): Promise<number> {
  try {
    const poolsData: IYield[] = (
      await fetchURL('https://yields.llama.fi/pools')
    )?.data;

    // Find Lido stETH pool as benchmark for ETH staking APY
    const ethStakingPool = poolsData.find(
      (pool) =>
        pool.chain === 'Ethereum' &&
        pool.project === 'lido' &&
        pool.symbol?.toLowerCase().includes('steth')
    );

    if (ethStakingPool) {
      const apy =
        ethStakingPool.apy ||
        ethStakingPool.apyBase ||
        ethStakingPool.apyMean30d;

      if (apy && typeof apy === 'number') {
        return apy / 100;
      }
    }
  } catch (error) {
    return DEFAULT_APY;
  }

  return DEFAULT_APY;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const apy = await fetchEthStakingAPY();

  const supplyStart = await options.fromApi.call({
    target: GETH_CONTRACT,
    abi: abis.totalSupply,
  });

  const supplyEnd = await options.toApi.call({
    target: GETH_CONTRACT,
    abi: abis.totalSupply,
  });

  const avgSupply = (BigInt(supplyStart) + BigInt(supplyEnd)) / 2n;

  const dailyStakingRewards =
    (avgSupply * BigInt(Math.floor(apy * 1e18))) / BigInt(1e18) / 365n;

  dailyFees.addGasToken(dailyStakingRewards);

  const protocolRevenue =
    (dailyStakingRewards * BigInt(Math.floor(SERVICE_FEE_RATE * 1e18))) /
    BigInt(1e18);
  dailyRevenue.addGasToken(protocolRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Ethereum staking rewards estimated from GETH supply × ETH staking APY / 365. APY is sourced from DefiLlama Yields using Lido stETH as benchmark.',
  Revenue:
    '10% service fee on staking rewards to cover validator infrastructure costs.',
  ProtocolRevenue: 'Same as Revenue - 10% of estimated staking rewards.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-10-20',
    },
  },
  methodology,
};

export default adapter;
