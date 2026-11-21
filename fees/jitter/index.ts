import BigNumber from 'bignumber.js';
import { chains } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { graphqlCall } from '../../helpers/sui';

// Defining package IDs survive upgrades. Vault definitions match the Jitter TVL adapter:
// https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/jitter/index.js
const CORE = '0xa8a74beede1f9574474d8c56a5147659390344eeae109d67d5db50cdba39d0c8';
const ORACLE = '0x9b071eaad9d3d764cbae7ca6473ac0f2dcc1f7c5f8076851fa46f1aafe0c3f67';
const POINT_PACKAGE = '0x15e9e1df6c5c67e16244069eb4b2feb10f16ae7d3f06fc51b8b51e1dc70a6f37';
// Jitter-branded JITTER_POINT/USDC book, not other Liquidlink projects.
const POINT_BOOK = '0x3deb69e0b256375f8805a392b9258c5236ad8cc028b8789e2d2240b24636dd1d';
const POINT_QUOTE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const VAULTS = [
  '0xe77999674332f5bd078c8d7182002f7bbf7844591f4d36dbfd1182b25ae071c0::scallop_market_vault::ScallopMarketVault',
  '0x4e4f6a5ee9504840a1bd5a9db589782fa44d6d1ce6f4fe45e93c6b664e161ca3::haedal_market_vault::HaedalMarketVault',
  '0xc56a55893f4791d03726f9c109725765b584c06eb5625704ce782112d763ef99::ember_market_vault::EmberMarketVault',
];
const Q64 = new BigNumber(2).pow(64);
type Payload = Record<string, string>;
export type JitterEvent = {
  sequenceNumber: number;
  transaction: { digest: string };
  contents: { json: Payload };
};

function unsigned(value: string): BigNumber {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid Jitter event amount');
  return new BigNumber(value);
}

// Use the most recent price consumed BEFORE this swap in the SAME transaction.
// Timestamp sorting cannot distinguish multiple operations in one PTB.
export function swapIndex(event: JitterEvent, prices: JitterEvent[]): BigNumber {
  const candidates = prices.filter(price => price.transaction.digest === event.transaction.digest &&
    price.contents.json.market_id === event.contents.json.market_state_id &&
    price.sequenceNumber < event.sequenceNumber);
  const price = candidates.sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
  if (!price) throw new Error(`Missing execution-time SY price: ${event.transaction.digest}`);
  const index = unsigned(price.contents.json.sy_index);
  if (index.isZero()) throw new Error('Zero execution-time SY price');
  return index;
}

export function feeAmounts(event: JitterEvent, kind: 'swap' | 'yield', index?: BigNumber) {
  const data = event.contents.json;
  if (kind === 'swap') {
    const gross = unsigned(data.fee), protocol = unsigned(data.reserve_fee);
    if (protocol.gt(gross)) throw new Error('Jitter reserve fee exceeds swap fee');
    if (!index || index.lte(0)) throw new Error('Missing execution-time swap index');
    const convert = (amount: BigNumber) => amount.times(index).div(Q64);
    return { gross: convert(gross), protocol: convert(protocol), supply: convert(gross.minus(protocol)) };
  }
  // Both interest counters are Q64 fractional SY atomic units, NOT u64 SY.
  const user = unsigned(data.user_interest_raw), protocol = unsigned(data.treasury_interest_raw);
  const pyIndex = unsigned(data.py_index_raw);
  if (pyIndex.isZero()) throw new Error('Zero checkpoint SY price');
  const convert = (amount: BigNumber) => amount.times(pyIndex).div(Q64).div(Q64);
  return { gross: convert(user.plus(protocol)), protocol: convert(protocol), supply: convert(user) };
}

export function pointFeeAmount(event: JitterEvent): BigNumber | null {
  const data = event.contents.json;
  if (data.orderbook_id !== POINT_BOOK) return null;
  const quote = data.quote.startsWith('0x') ? data.quote : `0x${data.quote}`;
  if (chains.sui.normalizeCoinType(quote) !== chains.sui.normalizeCoinType(POINT_QUOTE)) throw new Error('Unexpected Jitter Points quote asset');
  const fee = unsigned(data.fee_amount);
  if (fee.gt(unsigned(data.gross_quote_amount))) throw new Error('Point fee exceeds trade notional');
  return fee;
}

export async function readEvents(type: string, options: Pick<FetchOptions, 'startTimestamp' | 'endTimestamp'>): Promise<JitterEvent[]> {
  const rows: JitterEvent[] = [];
  let before: string | null = null;
  do {
    // Same reverse window walk as helpers/sui.queryEvents, retaining sequenceNumber
    // so multiple oracle consumes inside one transaction cannot be misordered.
    const data = await graphqlCall(`query ($before: String) {
      events(last: 50, before: $before, filter: { type: "${type}" }) {
        pageInfo { hasPreviousPage startCursor }
        nodes { timestamp sequenceNumber transaction { digest } contents { json } }
      }
    }`, { before });
    for (let i = data.events.nodes.length - 1; i >= 0; i--) {
      const event = data.events.nodes[i];
      const timestamp = Date.parse(event.timestamp) / 1000;
      if (!Number.isFinite(timestamp)) throw new Error('Invalid Jitter event timestamp');
      if (timestamp >= options.endTimestamp) continue;
      if (timestamp < options.startTimestamp) return rows.reverse();
      if (timestamp >= options.startTimestamp) rows.push(event);
    }
    const page = data.events.pageInfo;
    if (page.hasPreviousPage && (!page.startCursor || page.startCursor === before)) throw new Error('Jitter event pagination stalled');
    before = page.hasPreviousPage ? page.startCursor : null;
  } while (before);
  return rows.reverse();
}

async function marketTokens(): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  for (const type of VAULTS) {
    const vaults = await chains.sui.getObjectsByType({ type });
    for (const vault of vaults) {
      const tag = chains.sui.parseStructTag(vault.type);
      const underlying = tag.module === 'haedal_market_vault' ? '0x2::sui::SUI' : tag.typeParams[0];
      if (!underlying || !vault.fields.market_id) throw new Error('Invalid Jitter vault asset mapping');
      const key = vault.fields.market_id;
      if (tokens.has(key) && tokens.get(key) !== underlying) throw new Error('Conflicting Jitter market assets');
      tokens.set(key, underlying);
    }
  }
  return tokens;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const swaps = await readEvents(`${CORE}::market::MarketSwapEvent`, options);
  const interest = await readEvents(`${CORE}::market::MarketInterestCollectedEvent`, options);
  const pointFees = await readEvents(`${POINT_PACKAGE}::event::OrderbookCoinQuoteFeeAccrued`, options);
  for (const event of pointFees) {
    const amount = pointFeeAmount(event);
    if (amount === null) continue;
    dailyFees.add(POINT_QUOTE, amount.toFixed(), 'Point Trading Fees');
    dailyRevenue.add(POINT_QUOTE, amount.toFixed(), 'Point Trading Fees To Treasury');
  }
  if (swaps.length || interest.length) {
    const prices = swaps.length ? await readEvents(`${ORACLE}::price_info::PriceInfoConsumedEvent`, options) : [];
    const tokens = await marketTokens();
    const buckets = new Map<string, { token: string; label: string; supplyLabel: string; gross: BigNumber; protocol: BigNumber }>();
    for (const [events, kind] of [[swaps, 'swap'], [interest, 'yield']] as const) {
      for (const event of events) {
        const token = tokens.get(event.contents.json.market_state_id);
        if (!token) throw new Error(`Unknown Jitter fee market: ${event.contents.json.market_state_id}`);
        const amounts = feeAmounts(event, kind, kind === 'swap' ? swapIndex(event, prices) : undefined);
        const label = kind === 'swap' ? 'AMM Swap Fees' : 'Checkpointed Yield';
        const key = `${token}:${label}`;
        const bucket = buckets.get(key) ?? { token, label, supplyLabel: kind === 'swap' ? 'Swap Fees To LPs' : 'Yield To YT Holders', gross: new BigNumber(0), protocol: new BigNumber(0) };
        bucket.gross = bucket.gross.plus(amounts.gross);
        bucket.protocol = bucket.protocol.plus(amounts.protocol);
        buckets.set(key, bucket);
      }
    }
    for (const bucket of buckets.values()) {
      // SDK balances require integer token atoms. Floor only after aggregation;
      // derive supply from the rounded total so Fees = Revenue + SupplySideRevenue.
      const gross = bucket.gross.integerValue(BigNumber.ROUND_FLOOR);
      const protocol = bucket.protocol.integerValue(BigNumber.ROUND_FLOOR);
      dailyFees.add(bucket.token, gross.toFixed(), bucket.label);
      dailyRevenue.add(bucket.token, protocol.toFixed(), `${bucket.label} To Treasury`);
      dailySupplySideRevenue.add(bucket.token, gross.minus(protocol).toFixed(), bucket.supplyLabel);
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // First live Jitter market was created on 2026-10-18; event type origins remain unchanged in Core v3.
  adapter: { [CHAIN.SUI]: { start: '2026-10-18', fetch } },
  methodology: {
    Fees: 'Swap fees paid by traders in Jitter markets, yield earned by the assets deposited in Jitter markets, and trading fees on the Jitter Points (JITTER_POINT/USDC) orderbook.',
    Revenue: 'The protocol share of swap fees and of deposited-asset yield, plus all trading fees on the Jitter Points orderbook.',
    ProtocolRevenue: 'The protocol share of swap fees and of deposited-asset yield, plus all trading fees on the Jitter Points orderbook, all kept by the Jitter treasury.',
    SupplySideRevenue: 'Swap fees paid to liquidity providers and yield paid to YT holders, after the protocol share.',
  },
  breakdownMethodology: {
    Fees: {
      'AMM Swap Fees': 'Swap fees paid by traders in Jitter markets, valued in the underlying asset at the price used for each swap.',
      'Checkpointed Yield': 'Yield earned by the Scallop, Haedal and Ember yield-bearing assets held in Jitter markets, counted when a market checkpoints accrued interest, so daily amounts can be uneven.',
      'Point Trading Fees': 'Maker and taker fees charged on trades in the Jitter Points (JITTER_POINT/USDC) orderbook, counted when charged; other projects orderbooks on the same contracts are excluded.',
    },
    Revenue: {
      'AMM Swap Fees To Treasury': 'The protocol share of each swap fee, as recorded on-chain for that swap.',
      'Checkpointed Yield To Treasury': 'The protocol share of deposited-asset yield, counted at each interest checkpoint.',
      'Point Trading Fees To Treasury': 'All Jitter Points orderbook trading fees, which accrue to the Jitter fee vault.',
    },
    ProtocolRevenue: {
      'AMM Swap Fees To Treasury': 'The protocol share of each swap fee, kept by the Jitter treasury.',
      'Checkpointed Yield To Treasury': 'The protocol share of deposited-asset yield, kept by the Jitter treasury.',
      'Point Trading Fees To Treasury': 'All Jitter Points orderbook trading fees, kept by the Jitter fee vault.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Swap fees left to liquidity providers after the protocol share.',
      'Yield To YT Holders': 'Deposited-asset yield paid to YT holders after the protocol share.',
    },
  },
};
export default adapter;
