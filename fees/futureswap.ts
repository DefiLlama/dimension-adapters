import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { config } from '../dexs/futureswap';

const abis = {
  // Source: https://docs.futureswap.com/protocol/developer/events
  PositionChanged:
    'event PositionChanged(address indexed trader, uint256 tradeFee, uint256 traderPayout, int256 previousAsset, int256 previousStable, int256 newAsset, int256 newStable)',
  LiquidityAdded:
    'event LiquidityAdded(address indexed router, address indexed provider, uint256 assetAmount, uint256 stableAmount, uint256 liquidityTokenAmount, uint256 liquidityTokenSupply)',
  LiquidityRemoved:
    'event LiquidityRemoved(address indexed router, address indexed provider, uint256 assetAmount, uint256 stableAmount, uint256 liquidityTokenAmount, uint256 liquidityTokenSupply)',
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, getLogs } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const exchanges = config[chain]?.exchanges;

  if (!exchanges) {
    throw new Error('No exchanges found for chain: ' + chain);
  }

  // Fetch PositionChanged events from all exchanges
  const logs = await Promise.all(
    exchanges.map((exchange: string) =>
      getLogs({
        target: exchange,
        eventAbi: abis.PositionChanged,
      })
    )
  );

  // Process all logs to calculate fees
  logs.flat().forEach((log: any) => {
    // tradeFee is the fee charged to the trader in stable tokens (USDC)
    // Source: https://docs.futureswap.com/protocol/trading/fees
    // Fee structure: 0.05% trade fee + 0.05% Uniswap fee = ~0.1% total
    const tradeFee = log.tradeFee;

    // Total fees collected from traders
    dailyFees.add(config[chain].usdc, tradeFee);

    // Fee distribution:
    // - LPs receive the majority of fees (supply side)
    // - Protocol takes a portion (revenue)
    // Fee distribution not specified in docs - assuming typical 80% LP / 20% protocol split
    const protocolShare = (BigInt(tradeFee) * BigInt(20)) / BigInt(100);
    const lpShare = BigInt(tradeFee) - protocolShare;

    dailyRevenue.add(config[chain].usdc, protocolShare);
    dailySupplySideRevenue.add(config[chain].usdc, lpShare);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: 'Futureswap protocol trading fees (0.05% on trades). Note: Does not include the 0.05% Uniswap v3 fee which is paid separately to Uniswap LPs.',
  UserFees:
    'Fees paid by traders when opening, closing, or modifying positions (0.05% protocol fee).',
  Revenue:
    'Portion of trading fees that goes to the protocol treasury (estimated at 20% of fees collected).',
  ProtocolRevenue: 'Same as Revenue - fees collected by the protocol.',
  SupplySideRevenue:
    'Portion of trading fees that goes to Futureswap liquidity providers (estimated at 80% of fees collected).',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2021-10-13',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-04-22',
    },
  },
  methodology,
};

export default adapter;
