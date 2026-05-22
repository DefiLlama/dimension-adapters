import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';

const ZAP = '0x693F12E9E6B35b34458793546065E8b08e0299d6';
const USDC = ADDRESSES.hyperliquid.USDC;

const buyAbi = 'event Buy(address indexed token, address indexed buyer, uint256 usdcIn, uint256 tokensOut)';
const sellAbi = 'event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 usdcOut)';

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [buyLogs, sellLogs] = await Promise.all([
    options.getLogs({ target: ZAP, eventAbi: buyAbi }),
    options.getLogs({ target: ZAP, eventAbi: sellAbi }),
  ]);

  for (const log of buyLogs) {
    const usdcIn = BigInt((log as any).usdcIn);
    const fee = (usdcIn * 75n) / 10000n;
    const protocol = (usdcIn * 50n) / 10000n;
    dailyVolume.add(USDC, usdcIn);
    dailyFees.add(USDC, fee);
    dailyRevenue.add(USDC, protocol);
    dailySupplySideRevenue.add(USDC, fee - protocol);
  }

  for (const log of sellLogs) {
    // fee is already taken from usdcOut
    const usdcOut = BigInt((log as any).usdcOut);
    const gross = (usdcOut * 10000n) / 9925n;
    const fee = gross - usdcOut;
    const protocol = (gross * 50n) / 10000n;
    dailyVolume.add(USDC, gross);
    dailyFees.add(USDC, fee);
    dailyRevenue.add(USDC, protocol);
    dailySupplySideRevenue.add(USDC, fee - protocol);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-05-14',
  methodology: {
    Volume: 'Total value of buys and sells routed through the Zap contract.',
    Fees: '0.75% fee on each buy and sell.',
    Revenue: '0.5% of each trade goes to the protocol.',
    SupplySideRevenue: '0.25% of each trade goes to the token creator.',
  },
};

export default adapter;
