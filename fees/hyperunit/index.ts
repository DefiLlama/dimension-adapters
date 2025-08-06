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
        PARSE_JSON(_extra_fields):buyer:fee_token::string as buyer_fee_token,
        PARSE_JSON(_extra_fields):seller:fee_token::string as seller_fee_token,
        COALESCE(TRY_TO_DECIMAL(PARSE_JSON(_extra_fields):buyer:fee::string, 38, 18), 0) as buyer_fee,
        COALESCE(TRY_TO_DECIMAL(PARSE_JSON(_extra_fields):seller:fee::string, 38, 18), 0) as seller_fee
      FROM hyperliquid.dex.trades
      WHERE timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
        AND timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
        AND market_type = 'spot'
    ),
    buyer_fees AS (
      SELECT 
        buyer_fee_token as fee_token,
        SUM(buyer_fee) as total_fees
      FROM base_trades
      WHERE buyer_fee_token IN (${Object.keys(CG_UNIT_DEPLOYED_TOKENS).map(token => `'${token}'`).join(',')})
        AND buyer_fee > 0
      GROUP BY buyer_fee_token
    ),
    seller_fees AS (
      SELECT 
        seller_fee_token as fee_token,
        SUM(seller_fee) as total_fees
      FROM base_trades
      WHERE seller_fee_token IN (${Object.keys(CG_UNIT_DEPLOYED_TOKENS).map(token => `'${token}'`).join(',')})
        AND seller_fee > 0
      GROUP BY seller_fee_token
    )
    SELECT 
      COALESCE(bf.fee_token, sf.fee_token) as token_symbol,
      COALESCE(bf.total_fees, 0) as buyer_fees,
      COALESCE(sf.total_fees, 0) as seller_fees,
      COALESCE(bf.total_fees, 0) + COALESCE(sf.total_fees, 0) as total_fees
    FROM buyer_fees bf
    FULL OUTER JOIN seller_fees sf ON bf.fee_token = sf.fee_token
    WHERE COALESCE(bf.total_fees, 0) + COALESCE(sf.total_fees, 0) > 0
  `;

  const data = await queryAllium(spotTradeFeesQuery);
  const dailyFees = options.createBalances();

  for(const row of data) {
    const cgToken = CG_UNIT_DEPLOYED_TOKENS[row.token_symbol];
    dailyFees.addCGToken(cgToken, Number(row.total_fees));
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: '0'
  }
}


const methodology = {
  Fees: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  Revenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  ProtocolRevenue: 'Trading fees from spot token volume where Hyperunit is the deployer of the token.',
  HoldersRevenue: 'No Token Holders Revenue.',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-13',
  methodology,
  isExpensiveAdapter: true,
}

export default adapter;
