// Bounce - Leveraged Tokens on HyperEVM (Open Interest)
//
// Open Interest = sum of (totalSupply × exchangeRate × targetLeverage / (1e18^3 / 10^decimals)) across all tokens
//   totalSupply    = outstanding LT token supply
//   exchangeRate   = current NAV per LT token
//   targetLeverage = leverage multiplier per token
//   Open Interest  = totalSupply × exchangeRate × targetLeverage / (1e18^3 / 10^decimals) → base asset units
//
// Contract resolution chain:
//   GlobalStorage.factory()         → Factory address
//   Factory.lts()                   → All deployed LeveragedToken addresses
//   LeveragedToken.totalSupply()    → Outstanding LT supply
//   LeveragedToken.exchangeRate()   → NAV per LT
//   LeveragedToken.targetLeverage() → Leverage multiplier per token
//   LeveragedToken.isLong()         → Long vs short side

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GLOBAL_STORAGE = '0xa07d06383c1863c8A54d427aC890643d76cc03ff';

const fetch = async (options: FetchOptions) => {
  const factory = await options.api.call({ abi: 'address:factory', target: GLOBAL_STORAGE });
  const baseAsset = await options.api.call({ abi: 'address:baseAsset', target: GLOBAL_STORAGE });
  const decimals: number = await options.api.call({ abi: 'uint8:decimals', target: baseAsset });
  const SCALE = (10n ** 18n) ** 3n / 10n ** BigInt(decimals); // supply[1e18] * rate[1e18] * leverage[1e18], scaled down to base asset decimals

  const lts: string[] = await options.api.call({ abi: 'address[]:lts', target: factory });

  const totalSupplies = await options.api.multiCall({ abi: 'uint256:totalSupply', calls: lts });
  const exchangeRates = await options.api.multiCall({ abi: 'uint256:exchangeRate', calls: lts, permitFailure: true });
  const leverages = await options.api.multiCall({ abi: 'uint256:targetLeverage', calls: lts });
  const isLongs = await options.api.multiCall({ abi: 'bool:isLong', calls: lts });

  const openInterestAtEnd = options.createBalances();

  lts.forEach((_lt, i) => {
    const rate = BigInt(exchangeRates[i] ?? 0);
    if (rate === 0n) return;
    const supply = BigInt(totalSupplies[i]);
    const leverage = BigInt(leverages[i]);
    const notional = supply * rate * leverage / SCALE;
    const label = isLongs[i] ? 'Long Open Interest' : 'Short Open Interest';
    openInterestAtEnd.add(baseAsset, notional, label);
  });

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    OpenInterest: "Sum of totalSupply × exchangeRate × targetLeverage across all leveraged token contracts, representing total notional exposure",
  },
  breakdownMethodology: {
    "Long Open Interest": "Notional exposure of long leveraged token contracts",
    "Short Open Interest": "Notional exposure of short leveraged token contracts",
  },
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
    },
  },
};

export default adapter;
