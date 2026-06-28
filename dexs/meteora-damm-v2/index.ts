import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { Dependencies, FetchOptions } from '../../adapters/types';
import { METRIC } from '../../helpers/metrics';
import { getSolanaReceived } from '../../helpers/token';

const meteoraStatsEndpoint = 'https://damm-v2.datapi.meteora.ag/pools';
const BUYBACK_WALLET = 'FzULv8pR9Rd7cyVKjVkzmJ1eqEmgwDnzjYyNUcEJtoG9';
const MET_MINT = 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL';
const REFERRAL_FEES = 'Referral Fees';

interface Pool {
  pages: number
  data: Array<{
    tvl: number
    is_blacklisted: boolean
    volume: { '24h': number }
    // fees['24h'] = LP fees only: lp_fee = total_swap_fee * (1 - protocol_fee_pct/100)
    fees: { '24h': number }
    // protocol_fees['24h'] = net protocol fees after referral deduction.
    // Referral fee (docs: up to 20% of gross protocol fee) is already subtracted.
    protocol_fees: { '24h': number }
    pool_config: { protocol_fee_pct: number }
  }>
}

async function fetch(options: FetchOptions) {
  let dailyVolume = 0;
  let totalFees = 0;
  let lpFees = 0;
  let protocolFees = 0;
  let referralFees = 0;

  let page = 1;
  const limit = 1000;
  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(limit),
      sort_by: 'volume_24h:desc',
    });
    const response: Pool = (await httpGet(`${meteoraStatsEndpoint}?${params.toString()}`));

    const pools = response.data || [];
    if (pools.length === 0) break;
    for (const pool of pools) {
      if (pool.is_blacklisted) continue;

      const tvl = Number(pool.tvl ?? 0);
      const poolVolume = Number(pool.volume?.['24h'] ?? 0);
      const poolLpFees = Number(pool.fees?.['24h'] ?? 0);
      const poolProtocolFees = Number(pool.protocol_fees?.['24h'] ?? 0);

      // Exclude likely wash-trading pools: high volume with negligible TVL
      if (tvl < 1_000_000 && poolVolume > tvl * 10) continue;

      // Derive gross total swap fee from LP fees using the pool's protocol fee percentage.
      // LP fees = total_swap_fee * (1 - protocol_fee_pct/100)
      // => total_swap_fee = LP fees / (1 - protocol_fee_pct/100)
      const protocolFeeRatio = Number(pool.pool_config?.protocol_fee_pct ?? 0) / 100;

      let poolTotalFees: number;
      if (protocolFeeRatio > 0 && protocolFeeRatio < 1) {
        poolTotalFees = poolLpFees / (1 - protocolFeeRatio);
      } else if (poolLpFees > 0 && poolProtocolFees > 0) {
        const inferredRatio = poolProtocolFees / (poolLpFees + poolProtocolFees);
        poolTotalFees = poolLpFees / (1 - inferredRatio);
      } else {
        poolTotalFees = poolLpFees + poolProtocolFees;
      }

      // Referral fees = gross total - LP fees - net protocol fees.
      // Docs: referral = up to 20% of gross protocol fee per swap.
      const poolReferralFees = Math.max(poolTotalFees - poolLpFees - poolProtocolFees, 0);

      dailyVolume += poolVolume;
      totalFees += poolTotalFees;
      lpFees += poolLpFees;
      protocolFees += poolProtocolFees;
      referralFees += poolReferralFees;
    }

    if ([dailyVolume, totalFees, lpFees, protocolFees, referralFees].some(isNaN)) throw new Error('Invalid data from Meteora DAMM v2 API');

    if (page >= response.pages) break;
    page += 1;
  }

  // MET tokens received by the Meteora buyback wallet (FzULv8pR9Rd7cyVKjVkzmJ1eqEmgwDnzjYyNUcEJtoG9).
  // Protocol fees fund the buyback program; buybacks are tracked independently
  // because they execute asynchronously from fee collection.
  const dailyHoldersRevenue = await getSolanaReceived({
    options,
    target: BUYBACK_WALLET,
    mints: [MET_MINT],
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // totalFees = lpFees + grossProtocolFees = lpFees + netProtocolFees + referralFees
  dailyFees.addUSDValue(totalFees, METRIC.SWAP_FEES);

  dailyRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);

  dailySupplySideRevenue.addUSDValue(lpFees, METRIC.LP_FEES);
  dailySupplySideRevenue.addUSDValue(referralFees, REFERRAL_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

export default {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2025-04-18'
    }
  },
  methodology: {
    Volume: '24h swap volume from Meteora DAMM v2 pools, excluding blacklisted and low-TVL wash-trade pools.',
    Fees: 'Gross swap fees (LP fees + protocol fees + referral fees).',
    UserFees: 'Gross swap fees paid by traders.',
    Revenue: 'Net protocol fees from pool API protocol_fees[24h] (protocol share minus referral fees).',
    ProtocolRevenue: 'Protocol fees retained in treasury.',
    HoldersRevenue: 'MET tokens received by the Meteora buyback wallet, funded from protocol revenue.',
    SupplySideRevenue: 'LP fees plus inferred referral fees paid to swap hosts.',
  },
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: 'Gross swap fees across all non-blacklisted DAMM v2 pools.' },
    UserFees: { [METRIC.SWAP_FEES]: 'Gross swap fees paid by traders.' },
    Revenue: { [METRIC.PROTOCOL_FEES]: 'Net protocol fees (pool API protocol_fees[24h]).' },
    ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: 'Protocol fees retained in treasury.' },
    HoldersRevenue: { [METRIC.TOKEN_BUY_BACK]: 'MET tokens received by the Meteora buyback wallet.' },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: 'LP fees from pool API fees[24h].',
      [REFERRAL_FEES]: 'Referral fees inferred as gross_total − LP_fees − net_protocol_fees.',
    },
  }
}
