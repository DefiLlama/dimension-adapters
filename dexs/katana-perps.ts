import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";

const OLD_EXCHANGE_CONTRACT = '0x835Ba5b1B202773A94Daaa07168b26B22584637a';
const NEW_EXCHANGE_CONTRACT = '0x62230CeA619F734cc215bB8074bbF07bE4Eb633e';
const UPGRADE_TIMESTAMP = 1777300239; // Apr-27-2026 02:30:39 PM UTC
const QUOTE_TOKEN = '0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36';
// Event quantities are in pips (8 decimals), USDC is 6 decimals
const PIP_DECIMALS_ADJUSTMENT = 1e2;

const ABIS = {
  TradeExecuted: 'event TradeExecuted (address buyWallet, address sellWallet, string baseAssetSymbol, string quoteAssetSymbol, uint64 baseQuantity, uint64 quoteQuantity, uint8 makerSide, int64 makerFeeQuantity, uint64 takerFeeQuantity)',
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const targets: string[] = [];
  if (options.fromTimestamp < UPGRADE_TIMESTAMP) targets.push(OLD_EXCHANGE_CONTRACT);
  if (options.toTimestamp >= UPGRADE_TIMESTAMP) targets.push(NEW_EXCHANGE_CONTRACT);

  const logs = await options.getLogs({ targets, eventAbi: ABIS.TradeExecuted });
  for (const log of logs) {
    dailyVolume.add(QUOTE_TOKEN, Number(log.quoteQuantity) / PIP_DECIMALS_ADJUSTMENT);
    dailyFees.add(QUOTE_TOKEN, Math.abs(Number(log.makerFeeQuantity)) / PIP_DECIMALS_ADJUSTMENT, 'Maker Fees');
    dailyFees.add(QUOTE_TOKEN, Number(log.takerFeeQuantity) / PIP_DECIMALS_ADJUSTMENT, 'Taker Fees');
  }

  return {
    dailyVolume,
    dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2026-01-12',
  chains: [CHAIN.KATANA],
  skipBreakdownValidation: true,
  methodology: {
    Volume: 'Count trade size from TradeExecuted from exchange contract',
    Fees: 'Total fees paid by makers and takers',
  },
  breakdownMethodology: {
    Fees: {
      'Maker Fees': 'Fees paid by makers on trades',
      'Taker Fees': 'Fees paid by takers on trades',
    },
  }
}

export default adapter;
