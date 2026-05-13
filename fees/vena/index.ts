import BigNumber from 'bignumber.js';
import { ChainApi } from '@defillama/sdk';
import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types';
import fetchURL from '../../utils/fetchURL';

const POOL_DATA_PROVIDER = '0xb6eEF266933382661827E36fE3f936396e80166E';
const SUSDNR_VAULT = '0x50AE83DBDC44208eDa1Ef722F87Bab0FFB195Eea';

const USDNR_ADDRESS = '0xD48e565561416dE59DA1050ED70b8d75e8eF28f9';
const MAINNET_WETH = 'ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const FLUENT_USDNR = `fluent:${USDNR_ADDRESS}`;

const RAY = 10n ** 27n;

// Same pricing strategy as the Vena TVL adapter — Vena's own oracle is a Pyth
// Lazer pull oracle that needs an authenticated keeper push to be fresh, so we
// price each reserve via DefiLlama's coins API (and getSharePrice for sUSDnr)
// to keep this adapter usable without secrets.
function readPrice(pricesByToken: Record<string, { price: number }>, feed: string): BigNumber {
  const entry = pricesByToken[feed];
  if (!entry) {
    throw new Error(`vena: no price returned for "${feed}" from coins.llama.fi`);
  }
  return new BigNumber(entry.price);
}

type Reserve = {
  symbol: string;
  address: string;
  decimals: number;
  priceFeed: string;
  calculateUSDPrice: (api: ChainApi, pricesByToken: Record<string, { price: number }>) => Promise<BigNumber>;
};

const RESERVES: Reserve[] = [
  {
    symbol: 'WETH',
    address: '0x927C469E58Daab257Ea60B2D8c37bEDD2a203A54',
    decimals: 18,
    priceFeed: MAINNET_WETH,
    calculateUSDPrice: async (_api, pricesByToken) => readPrice(pricesByToken, MAINNET_WETH),
  },
  {
    symbol: 'USDnr',
    address: USDNR_ADDRESS,
    decimals: 6,
    priceFeed: FLUENT_USDNR,
    calculateUSDPrice: async (_api, pricesByToken) => readPrice(pricesByToken, FLUENT_USDNR),
  },
  {
    symbol: 'sUSDnr',
    address: '0xFa9b3B45587f9fcdE14759121C3868C2733DCbf4',
    decimals: 6,
    priceFeed: FLUENT_USDNR,
    calculateUSDPrice: async (api, pricesByToken) => {
      const sharePrice = await api.call({ target: SUSDNR_VAULT, abi: 'uint256:getSharePrice' });
      const usdnrPrice = readPrice(pricesByToken, FLUENT_USDNR);
      return new BigNumber(sharePrice.toString()).shiftedBy(-6).times(usdnrPrice);
    },
  },
];

const abi = {
  ADDRESSES_PROVIDER: 'function ADDRESSES_PROVIDER() view returns (address)',
  getPool: 'function getPool() view returns (address)',
  getAllReservesTokens: 'function getAllReservesTokens() view returns ((string symbol, address tokenAddress)[])',
  getReserveTokensAddresses: 'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
  getReserveData: 'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
  getReserveNormalizedIncome: 'function getReserveNormalizedIncome(address asset) view returns (uint256)',
  RESERVE_TREASURY_ADDRESS: 'function RESERVE_TREASURY_ADDRESS() view returns (address)',
  balanceOf: 'function balanceOf(address account) view returns (uint256)',
};

// snapshot[i] = pendingFeesUnderlying(i) + collectorATokenBalance(i), in raw underlying units
async function snapshotTreasuryFees(
  api: ChainApi,
  pool: string,
  reserveAssets: string[],
  aTokens: string[],
  collector: string,
): Promise<bigint[]> {
  const [reserveData, normalizedIncomes, collectorBalances] = await Promise.all([
    api.multiCall({ target: POOL_DATA_PROVIDER, abi: abi.getReserveData, calls: reserveAssets }),
    api.multiCall({ target: pool, abi: abi.getReserveNormalizedIncome, calls: reserveAssets }),
    api.multiCall({
      abi: abi.balanceOf,
      calls: aTokens.map(aToken => ({ target: aToken, params: [collector] })),
    }),
  ]);

  return reserveAssets.map((_, i) => {
    const accruedToTreasuryScaled = BigInt(reserveData[i].accruedToTreasuryScaled.toString());
    const normalizedIncome = BigInt(normalizedIncomes[i].toString());
    // rayMul: integer multiply then divide by RAY (1e27)
    const pendingUnderlying = (accruedToTreasuryScaled * normalizedIncome) / RAY;
    const collectorBalance = BigInt(collectorBalances[i].toString());
    return pendingUnderlying + collectorBalance;
  });
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Sanity-check that the on-chain reserve list matches our hardcoded config.
  // sUSDnr's USD price needs the vault sharePrice() call, so we can't fall back
  // to a generic priceFeed map for unknown reserves.
  const onchainReserves: { symbol: string; tokenAddress: string }[] = await options.api.call({
    target: POOL_DATA_PROVIDER,
    abi: abi.getAllReservesTokens,
  });
  const configured = new Set(RESERVES.map(r => r.address.toLowerCase()));
  for (const r of onchainReserves) {
    if (!configured.has(r.tokenAddress.toLowerCase())) {
      throw new Error(`vena: unconfigured reserve ${r.symbol} (${r.tokenAddress})`);
    }
  }

  // Resolve Pool (for the live liquidity index) and Collector (for the
  // already-minted-to-treasury aToken balance).
  const addressesProvider = await options.api.call({
    target: POOL_DATA_PROVIDER,
    abi: abi.ADDRESSES_PROVIDER,
  });
  const pool = await options.api.call({ target: addressesProvider, abi: abi.getPool });

  const reserveAssets = RESERVES.map(r => r.address);
  const tokenAddresses = await options.api.multiCall({
    target: POOL_DATA_PROVIDER,
    abi: abi.getReserveTokensAddresses,
    calls: reserveAssets,
  });
  const aTokens: string[] = tokenAddresses.map((t: any) => t.aTokenAddress);

  const collector = await options.api.call({
    target: aTokens[0],
    abi: abi.RESERVE_TREASURY_ADDRESS,
  });

  // Price at the end of the period, not "now" — otherwise backfills would
  // price historical deltas with today's prices. The vault sharePrice() used
  // for sUSDnr is already evaluated via options.api, which is pinned to the
  // to-block, so it stays consistent with this timestamp.
  const allFeeds = [...new Set(RESERVES.map(r => r.priceFeed))].join(',');
  const [before, after, priceResp] = await Promise.all([
    snapshotTreasuryFees(options.fromApi, pool, reserveAssets, aTokens, collector),
    snapshotTreasuryFees(options.toApi, pool, reserveAssets, aTokens, collector),
    fetchURL(`https://coins.llama.fi/prices/historical/${options.toTimestamp}/${allFeeds}`),
  ]);
  const pricesByToken = priceResp.coins;

  console.log('vena fees diagnostics:');
  console.log('  pool:', pool, 'collector:', collector);
  for (let i = 0; i < RESERVES.length; i++) {
    const reserve = RESERVES[i];
    const deltaRaw = after[i] - before[i];

    const deltaUnderlying = new BigNumber(deltaRaw.toString()).shiftedBy(-reserve.decimals);
    const beforeUnderlying = new BigNumber(before[i].toString()).shiftedBy(-reserve.decimals);
    const afterUnderlying = new BigNumber(after[i].toString()).shiftedBy(-reserve.decimals);
    const usdPerToken = await reserve.calculateUSDPrice(options.api, pricesByToken);

    console.log(`  ${reserve.symbol}:`);
    console.log(`    cumulative(before) = ${beforeUnderlying.toFixed()} (${beforeUnderlying.times(usdPerToken).toFixed(4)} USD)`);
    console.log(`    cumulative(after)  = ${afterUnderlying.toFixed()} (${afterUnderlying.times(usdPerToken).toFixed(4)} USD)`);
    console.log(`    delta              = ${deltaUnderlying.toFixed()} (${deltaUnderlying.times(usdPerToken).toFixed(4)} USD)`);

    // Negative deltas mean the treasury withdrew/sold aTokens during the
    // period; that's not a fee inflow, so we skip rather than counting it.
    if (deltaRaw <= 0n) continue;

    const usdValue = deltaUnderlying.times(usdPerToken).toNumber();
    dailyFees.addUSDValue(usdValue);
    dailyRevenue.addUSDValue(usdValue);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: 'Per-reserve protocol cut of borrow interest routed to the Vena treasury on Fluent. Computed as the change between fromBlock and toBlock of (accruedToTreasury * getReserveNormalizedIncome / 1e27) + Collector aToken balance, summed across reserves and converted to USD.',
  Revenue: 'Same as fees — all of this accrual is collected by the Vena treasury.',
  ProtocolRevenue: 'Same as fees — all of this accrual is collected by the Vena treasury.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    fluent: {
      fetch,
      start: '2026-04-23',
    },
  },
  methodology,
};

export default adapter;
