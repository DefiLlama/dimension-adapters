import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { queryAllium } from '../../helpers/allium';

// const HYPERUNIT_DEPLOYER_ADDRESS = '0xf036a5261406a394bd63eb4df49c464634a66155'

const CG_UNIT_DEPLOYED_TOKENS = {
    'UBTC': 'unit-bitcoin',
    'UETH': 'unit-ethereum',
    'USOL': 'unit-solana',
    'UPUMP': 'unit-pump',
    'UBONK': 'bonk',
    'UFART': 'unit-fartcoin',
    'UUUSPX': 'spx6900',
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const spotTradeFeesQuery = `
    WITH base_trades AS (
      SELECT 
        token_a_symbol,
        sum(usd_amount) as volume_usd
      FROM hyperliquid.dex.trades
      WHERE timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
        AND timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
        AND market_type = 'spot'
    )
    SELECT 
      token_a_symbol,
      sum(volume_usd) as volume_usd
    FROM base_trades
    WHERE token_a_symbol IN (${Object.keys(CG_UNIT_DEPLOYED_TOKENS).map(token => `'${token}'`).join(',')})
  `;

  const data = await queryAllium(spotTradeFeesQuery);
  const dailyVolume = options.createBalances();

  for(const row of data) {
    const cgToken = CG_UNIT_DEPLOYED_TOKENS[row.token_a_symbol];
    dailyVolume.addCGToken(cgToken, Number(row.volume_usd));
  }

  return {
    dailyVolume
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-13',
  doublecounted: true,
  isExpensiveAdapter: true,
}

export default adapter;
