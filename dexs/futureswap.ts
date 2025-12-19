import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Exchange contracts for Futureswap
// Source: https://docs.futureswap.com/protocol/developer/addresses-abis-and-links
export const config: any = {
  [CHAIN.ARBITRUM]: {
    exchanges: [
      '0xF7CA7384cc6619866749955065f17beDD3ED80bC', // ETH/USDC
      '0x85DDE4A11cF366Fb56e05cafE2579E7119D5bC2f', // WBTC/ETH
    ],
    usdc: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  },
  [CHAIN.AVAX]: {
    exchanges: [
      '0xE9c2D66A1e23Db21D2c40552EC7fA3dFb91d0123', // JOE/USDC
      '0xb2698B90BE455D617c0C5c1Bbc8Bc21Aa33F2Bbb', // WAVAX/USDC
    ],
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  },
};

const abis = {
  // Source: https://docs.futureswap.com/protocol/developer/events
  PositionChanged: 'event PositionChanged(address indexed trader, uint256 tradeFee, uint256 traderPayout, int256 previousAsset, int256 previousStable, int256 newAsset, int256 newStable)',
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    targets: config[options.chain].exchanges,
    eventAbi: abis.PositionChanged,
    flatten: true,
  })

  // Process all logs to calculate volume
  logs.forEach((log: any) => {
    // Calculate volume from position change
    const volumeChange = Math.abs(
      Number(log.newStable) - Number(log.previousStable)
    );

    dailyVolume.add(config[options.chain].usdc, volumeChange);
    
    // tradeFee is the fee charged to the trader in stable tokens (USDC)
    // Source: https://docs.futureswap.com/protocol/trading/fees
    // Fee structure: 0.05% trade fee + 0.05% Uniswap fee = ~0.1% total
    const tradeFee = log.tradeFee;

    // Total fees collected from traders
    dailyFees.add(config[options.chain].usdc, tradeFee);

    // Fee distribution:
    // - LPs receive the majority of fees (supply side)
    // - Protocol takes a portion (revenue)
    // Fee distribution not specified in docs - assuming typical 80% LP / 20% protocol split
    const protocolShare = (BigInt(tradeFee) * BigInt(20)) / BigInt(100);
    const lpShare = BigInt(tradeFee) - protocolShare;

    dailyRevenue.add(config[options.chain].usdc, protocolShare);
    dailySupplySideRevenue.add(config[options.chain].usdc, lpShare);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Futureswap protocol trading fees (0.05% on trades). Note: Does not include the 0.05% Uniswap v3 fee which is paid separately to Uniswap LPs.',
    UserFees: 'Fees paid by traders when opening, closing, or modifying positions (0.05% protocol fee).',
    Revenue: 'Portion of trading fees that goes to the protocol treasury (estimated at 20% of fees collected).',
    ProtocolRevenue: 'Same as Revenue - fees collected by the protocol.',
    SupplySideRevenue: 'Portion of trading fees that goes to Futureswap liquidity providers (estimated at 80% of fees collected).',
    HoldersRevenue: 'No revenue share to FST token holders.',
  },
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2021-10-13',
    },
    [CHAIN.AVAX]: {
      start: '2022-04-22',
    },
  },
};

export default adapter;
