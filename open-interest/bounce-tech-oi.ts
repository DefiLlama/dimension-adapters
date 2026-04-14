// Bounce - Leveraged Tokens on HyperEVM (Open Interest)
//
// Open Interest = sum of (totalSupply × exchangeRate × targetLeverage / 1e18^3) across all tokens
//   totalSupply    = outstanding LT token supply
//   exchangeRate   = current NAV per LT token in USD (1e18 scale, includes unrealized PnL)
//   targetLeverage = leverage multiplier per token
//   Open Interest  = totalSupply × exchangeRate × targetLeverage / 1e18 ^ 3
//
// Contract resolution chain:
//   GlobalStorage.factory()         → Factory address
//   Factory.lts()                   → All deployed LeveragedToken addresses
//   LeveragedToken.totalSupply()    → Outstanding LT supply
//   LeveragedToken.exchangeRate()   → NAV per LT
//   LeveragedToken.targetLeverage() → Leverage multiplier per token

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GLOBAL_STORAGE = '0xa07d06383c1863c8A54d427aC890643d76cc03ff';
const SCALE = (10n ** 18n) ** 3n; // 1e18 ^ 3

const fetch = async (options: FetchOptions) => {
  const factory = await options.api.call({ abi: 'address:factory', target: GLOBAL_STORAGE });

  const lts: string[] = await options.api.call({ abi: 'address[]:lts', target: factory });

  const [totalSupplies, exchangeRates, leverages] = await Promise.all([
    options.api.multiCall({ abi: 'uint256:totalSupply', calls: lts }),
    options.api.multiCall({ abi: 'uint256:exchangeRate', calls: lts, permitFailure: true }),
    options.api.multiCall({ abi: 'uint256:targetLeverage', calls: lts }),
  ]);

  let openInterestAtEnd = 0;
  lts.forEach((_lt, i) => {
    const rate = BigInt(exchangeRates[i] ?? 0);
    if (rate === 0n) return;
    const supply = BigInt(totalSupplies[i]);
    const leverage = BigInt(leverages[i]);
    openInterestAtEnd += Number(supply * rate * leverage / SCALE);
  });

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2026-01-28',
    },
  },
};

export default adapter;
