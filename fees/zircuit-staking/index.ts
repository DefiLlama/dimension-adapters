import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

/**
 * https://docs.zircuit.com/build/liquidity-hub
 * Zircuit staking aggregates LST/LRT tokens and earns yields from underlying protocols.
 * All yields are passed through to users - Zircuit does not charge fees or retain revenue.
 */

const ZTAKING_POOL = "0xf047ab4c75cebf0eb9ed34ae2c186f3611aeafa6";
const RSETH_ORACLE = "0x349A73444b1a310BAe67ef67973022020d70020d";
const EZETH_RATE_PROVIDER = "0x387dBc0fB00b26fb085aa658527D5BE98302c84C";

// Exchange rate methods
const METHODS = {
  GET_RATE: "getRate",
  GET_STETH_BY_WSTETH: "getStETHByWstETH",
  GET_POOLED_ETH_BY_SHARES: "getPooledEthByShares",
  RSETH_PRICE: "rsETHPrice",
  ERC4626: "erc4626",
  RATE_PROVIDER: "rateProvider",
  TOTAL_UNDERLYING_SUPPLY: "totalUnderlyingSupply",
  EXCHANGE_RATE_TO_LST: "exchangeRateToLST",
} as const;

// Supported LST/LRT tokens with their addresses and exchange rate methods
const LST_LRT_TOKENS: { [token: string]: { address: string; methods: string[]; rateProvider?: string } } = {
  // Lido tokens
  WSTETH: {
    address: ADDRESSES.ethereum.WSTETH,
    methods: [METHODS.GET_STETH_BY_WSTETH],
  },
  STETH: {
    address: ADDRESSES.ethereum.STETH,
    methods: [METHODS.GET_POOLED_ETH_BY_SHARES],
  },
  
  // Ether.fi tokens
  WEETH: {
    address: ADDRESSES.ethereum.WEETH,
    methods: [METHODS.GET_RATE],
  },
  
  // Renzo
  EZETH: {
    address: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",
    methods: [METHODS.RATE_PROVIDER],
    rateProvider: EZETH_RATE_PROVIDER,
  },
  PZETH: {
    address: "0x8c9532a60E0E7C6BbD2B2c1303F63aCE1c3E9811",
    methods: [METHODS.ERC4626],
  },
  
  // Kelp (uses oracle)
  RSETH: {
    address: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7",
    methods: [METHODS.RSETH_PRICE],
  },
  
  // Swell tokens
  SWETH: {
    address: "0xf951E335afb289353dc249e82926178EaC7DEd78",
    methods: [METHODS.GET_RATE],
  },
  RSWETH: {
    address: "0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0",
    methods: [METHODS.GET_RATE],
  },
  
  // Liquid Collective
  LSETH: {
    address: "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549",
    methods: [METHODS.TOTAL_UNDERLYING_SUPPLY],
  },
  
  // Eigenpie tokens
  EGETH: {
    address: "0x18f313Fc6Afc9b5FD6f0908c1b3D476E3feA1DD9",
    methods: [METHODS.EXCHANGE_RATE_TO_LST],
  },
  
  // Puffer
  XPUFETH: {
    address: "0xD9A442856C234a39a81a089C06451EBAa4306a72",
    methods: [METHODS.ERC4626],
  },
  
  // StakeStone
  STONE: {
    address: "0x7122985656e38BDC0302Db86685bb972b145bD3C",
    methods: [METHODS.ERC4626],
  },
  
  LBTC: {
    address: "0x8236a87084f8B84306f72007F36F2618A5634494",
    methods: [METHODS.GET_RATE],
  },
  
  // Mellow tokens
  STEAKLRT: {
    address: "0xBEEF69Ac7870777598A04B2bd4771c71212E6aBc",
    methods: [METHODS.ERC4626],
  },
  RE7LRT: {
    address: "0x84631c0d0081FDe56DeB72F6DE77abBbF6A9f93a",
    methods: [METHODS.ERC4626],
  },
  AMPHRETH: {
    address: "0x5fD13359Ba15A84B76f7F87568309040176167cd",
    methods: [METHODS.ERC4626],
  },
  RSTETH: {
    address: "0x7a4EffD87C2f3C55CA251080b1343b605f327E3a",
    methods: [METHODS.ERC4626],
  },
};

// Helper to get exchange rate for a token using its specified methods
async function getExchangeRate(
  options: FetchOptions,
  token: string,
  isFromApi: boolean
): Promise<bigint | null> {
  const api = isFromApi ? options.fromApi : options.toApi;
  
  // Find token config by address
  const tokenConfig = Object.values(LST_LRT_TOKENS).find(
    (config) => config.address.toLowerCase() === token.toLowerCase()
  );
  
  if (!tokenConfig) {
    return null;
  }
  
  const methods = tokenConfig.methods;

  // Create promises for all methods in parallel
  const promises = methods.map(async (method): Promise<bigint | null> => {
      if (method === METHODS.GET_RATE) {
        const rate = await api.call({
          target: token,
          abi: "function getRate() external view returns (uint256)",
          permitFailure: true,
        });
        return rate ? BigInt(rate.toString()) : null;
      } else if (method === METHODS.GET_STETH_BY_WSTETH) {
        const result = await api.call({
          target: token,
          abi: "function getStETHByWstETH(uint256 _wstETHAmount) external view returns (uint256)",
          params: [String(10 ** 18)],
          permitFailure: true,
        });
        return result ? BigInt(result.toString()) : null;
      } else if (method === METHODS.GET_POOLED_ETH_BY_SHARES) {
        const result = await api.call({
          target: token,
          abi: "function getPooledEthByShares(uint256 _sharesAmount) external view returns (uint256)",
          params: [String(10 ** 18)],
          permitFailure: true,
        });
        return result ? BigInt(result.toString()) : null;
      } else if (method === METHODS.RSETH_PRICE) {
        const result = await api.call({
          target: RSETH_ORACLE,
          abi: "uint256:rsETHPrice",
          permitFailure: true,
        });
        return result ? BigInt(result.toString()) : null;
      } else if (method === METHODS.ERC4626) {
        const [totalAssets, totalSupply] = await Promise.all([
          api.call({
            target: token,
            abi: "function totalAssets() external view returns (uint256)",
            permitFailure: true,
          }),
          api.call({
            target: token,
            abi: "function totalSupply() external view returns (uint256)",
            permitFailure: true,
          })
        ]);
        
        if (totalAssets && totalSupply && BigInt(totalSupply.toString()) > 0n) {
          return (BigInt(totalAssets.toString()) * BigInt(10 ** 18)) / BigInt(totalSupply.toString());
        }
        return null;
      } else if (method === METHODS.RATE_PROVIDER && tokenConfig.rateProvider) {
        const rate = await api.call({
          target: tokenConfig.rateProvider,
          abi: "function getRate() external view returns (uint256)",
          permitFailure: true,
        });
        return rate ? BigInt(rate.toString()) : null;
      } else if (method === METHODS.TOTAL_UNDERLYING_SUPPLY) {
        // Liquid Collective: totalUnderlyingSupply / totalSupply
        const [totalUnderlyingSupply, totalSupply] = await Promise.all([
          api.call({
            target: token,
            abi: "uint256:totalUnderlyingSupply",
            permitFailure: true,
          }),
          api.call({
            target: token,
            abi: "uint256:totalSupply",
            permitFailure: true,
          })
        ]);
        if (totalUnderlyingSupply && totalSupply && BigInt(totalSupply.toString()) > 0n) {
          return (BigInt(totalUnderlyingSupply.toString()) * BigInt(10 ** 18)) / BigInt(totalSupply.toString());
        }
        return null;
      } else if (method === METHODS.EXCHANGE_RATE_TO_LST) {
        // Eigenpie: exchangeRateToLST()
        const result = await api.call({
          target: token,
          abi: "function exchangeRateToLST() external view returns (uint256)",
          permitFailure: true,
        });
        return result ? BigInt(result.toString()) : null;
      } 
      return null;
  });

  const results = await Promise.all(promises);
  return results.find(result => result !== null) ?? null;
}

async function calculateTokenYield(
  options: FetchOptions,
  token: string
): Promise<bigint> {
  // Fetch token balances before and after
  const balanceBefore = await options.fromApi.call({
    target: token,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [ZTAKING_POOL],
    permitFailure: true,
  });

  const balanceAfter = await options.toApi.call({
    target: token,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [ZTAKING_POOL],
    permitFailure: true,
  });

  if (!balanceBefore || !balanceAfter) {
    return 0n;
  }

  const balanceBeforeBig = BigInt(balanceBefore.toString());
  const balanceAfterBig = BigInt(balanceAfter.toString());

  if (balanceBeforeBig === 0n) {
    return 0n;
 }

  // Fetch exchange rates
  const rateBefore = await getExchangeRate(options, token, true);
  const rateAfter = await getExchangeRate(options, token, false);

  if (!rateBefore || !rateAfter || rateBefore === 0n) {
    return 0n;
  }

  const rateBeforeBig = BigInt(rateBefore.toString());
  const rateAfterBig = BigInt(rateAfter.toString());
  const decimalsBig = 10n ** 18n;

  const rateDelta = rateAfterBig - rateBeforeBig;

  if (rateDelta <= 0n) {
    return 0n;
  }

  const yieldAmount =
    (balanceAfterBig * rateDelta) / decimalsBig;

  return yieldAmount > 0n ? yieldAmount : 0n;
}


const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Calculate yields for each supported LST/LRT token
  const yieldPromises = Object.values(LST_LRT_TOKENS).map(async (tokenConfig) => {
    const yieldAmount = await calculateTokenYield(options, tokenConfig.address);
    if (yieldAmount > 0n) {
      dailyFees.addGasToken(yieldAmount);
      dailySupplySideRevenue.addGasToken(yieldAmount);
    }
  });

  await Promise.all(yieldPromises);

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total yields generated from all LST/LRT tokens staked in Zircuit. Includes staking rewards from Ethereum, AVS rewards from EigenLayer, and partner rewards. These yields are double-counted as they are already tracked by the underlying LST/LRT protocols.",
  Revenue: "No protocol revenue is collected by the Zircuit staking. All yields are passed through to users.",
  ProtocolRevenue: "No protocol revenue is collected by the Zircuit staking. All yields are passed through to users.",
  SupplySideRevenue: "100% of yields from LST/LRT tokens are passed through to stakers. Includes Ethereum staking rewards, EigenLayer AVS rewards, and partner rewards.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology,
  start: "2024-06-01",
  doublecounted: true,
};

export default adapter;
