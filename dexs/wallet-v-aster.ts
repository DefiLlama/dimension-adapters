import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { httpGet } from '../utils/fetchURL';

// Wallet V's daily totals from Aster Futures V3 Builder userTrades and userCommissions, builder 0x68c68ba58f50bdbe5c4a6faf0186b140eab2b764
const DAILY_API = 'https://api.walletv.io/defillama/aster/daily';

const BUILDER_FEES = 'Aster Builder Fees';
const BUILDER_FEES_TO_WALLET_V = 'Aster Builder Fees To Wallet V';

function usdtAmount(amounts: Record<string, string>) {
  for (const [asset, amount] of Object.entries(amounts))
    if (asset !== 'USDT' && Number(amount) !== 0) throw new Error(`Wallet V Aster: unpriced asset ${asset}`);
  return Number(amounts.USDT ?? 0);
}

async function fetch(options: FetchOptions) {
  const { code, data } = await httpGet(`${DAILY_API}?date=${options.dateString}`);
  if (code !== 0 || !data) throw new Error(`Wallet V Aster: no data for ${options.dateString}`);
  if (!data.takerVolumeComplete) throw new Error(`Wallet V Aster: taker volume incomplete for ${options.dateString}`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const builderFees = usdtAmount(data.builderFeesByAsset);
  dailyVolume.addUSDValue(usdtAmount(data.takerVolumeByQuoteAsset));
  dailyFees.addUSDValue(builderFees, BUILDER_FEES);
  dailyRevenue.addUSDValue(builderFees, BUILDER_FEES_TO_WALLET_V);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const revenueBreakdown = {
  [BUILDER_FEES_TO_WALLET_V]: 'Builder fees on Aster Futures fills placed through Wallet V, all kept by Wallet V.',
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ASTER],
  start: '2026-08-29',
  fetch,
  doublecounted: true,
  methodology: {
    Volume: 'Notional of taker fills placed through Wallet V on Aster Futures, counted on the UTC trade date.',
    Fees: 'Builder fees paid by users on Aster Futures trades placed through Wallet V, including privacy-mode trades.',
    Revenue: 'Builder fees paid by users on Aster Futures trades placed through Wallet V, all kept by Wallet V.',
    ProtocolRevenue: 'Builder fees paid by users on Aster Futures trades placed through Wallet V, all retained by Wallet V.',
  },
  breakdownMethodology: {
    Fees: { [BUILDER_FEES]: 'Builder fee charged on each Aster Futures fill placed through Wallet V.' },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
  },
};

export default adapter;
