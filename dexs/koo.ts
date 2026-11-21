import BigNumber from 'bignumber.js';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getConfig } from '../helpers/cache';
import ADDRESSES from '../helpers/coreAssets.json';

// Production contract/config: https://app.koo.xyz/ ; public ABI is shipped by its frontend.
const CORE = '0xA18b67e194d4f4bADe61d4e68cd135C63C438D1d';
const USDC = ADDRESSES.arbitrum.USDC_CIRCLE;
const TRADE = 'event TradeSettled(bytes32 indexed tradeId,uint256 indexed accountId1,uint256 indexed accountId2,string symbol,uint256 size,uint256 price,uint256 tradeValue,uint256 tradeTimestamp,uint8 direction1,uint8 role1,uint8 direction2,uint8 role2,uint8 tradeType)';

const fetch = async (options: FetchOptions) => {
  // Metadata is used only to classify instruments. Volume comes from settlement logs.
  const metadata = await getConfig('koo/contract-list', 'https://gw.koo.xyz/market/contract-list');
  if (!metadata.success || !Array.isArray(metadata.data) || !metadata.data.length)
    throw new Error('Koo market classification is unavailable');
  const markets = new Map<string, any>(metadata.data.map((market: any) => [market.symbol, market]));
  const logs = await options.getLogs({ target: CORE, eventAbi: TRADE });
  const dailyVolume = options.createBalances();
  const seen = new Set<string>();
  let notional = 0n;
  for (const log of logs) {
    // Ordinary matched fills observed against the public recent-trades API use code 0.
    // Other trade types are excluded rather than assumed to be user trading volume.
    if (Number(log.tradeType) !== 0 || BigInt(log.accountId1) === BigInt(log.accountId2)) continue;
    const market = markets.get(log.symbol);
    if (!market) throw new Error(`Koo market metadata missing for settled symbol ${log.symbol}`);
    if (typeof market.type !== 'string' || !market.type.trim()
      || typeof market.priceModel !== 'string' || !market.priceModel.trim())
      throw new Error(`Koo market classification missing for settled symbol ${log.symbol}`);
    // Initially track the independently verified linear-perpetual slice only.
    // Power contracts and market-share/event products are not mixed into this notional.
    if (market.type !== 'PERPETUAL' || market.priceModel !== 'LINEAR') continue;
    if (market.quoteCurrency !== 'USDC' || market.settleCurrency !== 'USDC')
      throw new Error(`Koo settlement denomination changed for ${log.symbol}`);
    if (![0, 1].includes(Number(log.role1)) || Number(log.role1) + Number(log.role2) !== 1)
      throw new Error(`Koo matched-fill role encoding changed for ${log.tradeId}`);
    const key = String(log.tradeId).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    notional += BigInt(log.tradeValue);
  }
  // tradeValue has 18 decimals; native USDC has 6. Preserve precision and let
  // DefiLlama price USDC instead of assuming a fixed USD peg.
  dailyVolume.add(USDC, new BigNumber(notional.toString()).dividedBy('1000000000000').toFixed());
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARBITRUM],
  fetch,
  methodology: {
    Volume: 'Gross notional from unique ordinary TradeSettled fills for linear USDC perpetuals, counted once per trade ID at on-chain settlement time. Same-account fills and non-ordinary trade codes are excluded. Power and market-share/event contracts are excluded from this initial verified slice. No deposits, withdrawals, transfers or position snapshots are counted. Differences from the venue dashboard can reflect execution versus settlement time and the narrower product scope.',
  },
};

export default adapter;
