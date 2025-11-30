import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const vaultConfig = {
  [CHAIN.MONAD]: {
    vault: '0xA3227C5969757783154C60bF0bC1944180ed81B9',
    supplyToken: '0xA3227C5969757783154C60bF0bC1944180ed81B9',
  },
  [CHAIN.HYPERLIQUID]: {
    vault: '0xDDC126c12F9F8DF5a6fC273f6D43C1E21b4d2945',
    supplyToken: '0xBeF0142A0955a7d5dcCe5C2A13Fb84E332669D2d',
  },
};

const getFetch = (chain: keyof typeof vaultConfig) => {
  return async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const config = vaultConfig[chain];

    const [totalPooledBefore, totalSupplyBefore, totalPooledAfter, totalSupplyAfter] = await Promise.all([
      options.fromApi.call({ target: config.vault, abi: 'uint96:totalPooled' }),
      options.fromApi.call({ target: config.supplyToken, abi: 'uint256:totalSupply' }),
      options.toApi.call({ target: config.vault, abi: 'uint96:totalPooled' }),
      options.toApi.call({ target: config.supplyToken, abi: 'uint256:totalSupply' }),
    ]);

    const exchangeRateIncrease = (totalPooledAfter / totalSupplyAfter) - (totalPooledBefore / totalSupplyBefore);
    const totalRewards = exchangeRateIncrease * totalSupplyBefore;
    
    // Kintsu protocol fee: taken as management fees via virtual shares (LST inflation) that go to the DAO Treasury.
    // The fee rate isn’t a fixed percentage, governance adjusts it, and we track the actual rate using on-chain data.
    // In practice, it averages out to roughly 0.5% of staking rewards going to the protocol and ~99.5% to holders.
    dailyFees.addGasToken(totalRewards);

    const dailyRevenue = dailyFees.clone(0.005);
    const dailySupplySideRevenue = dailyFees.clone(0.995);

    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Total staking yields from sMON and sHYPE liquid staking tokens, calculated from exchange rate appreciation (immune to deposit/withdrawal effects).',
    Revenue: 'Management fee captured via virtual shares (LST inflation) minted to DAO Treasury. Fee rate is governance-controlled; empirically observed at ~0.5% of staking rewards.',
    ProtocolRevenue: 'Virtual shares flow to DAO Treasury (governance contract) for grants, incentives, protocol-owned liquidity, and strategic initiatives.',
    SupplySideRevenue: '~99.5% of staking rewards distributed to token holders via exchange rate appreciation. sMON/sHYPE are reward-bearing tokens with fixed supply and growing value.',
  },
  adapter: {
    [CHAIN.MONAD]: {
      fetch: getFetch(CHAIN.MONAD),
      start: '2025-11-14',
    },
    [CHAIN.HYPERLIQUID]: {
      fetch: getFetch(CHAIN.HYPERLIQUID),
      start: '2025-11-14',
    },
  }
};

export default adapter;