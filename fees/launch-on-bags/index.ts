import { ethers } from "ethers";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getSqlFromFile, queryDuneResult, queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// Solana leg (Meteora DBC / DAMMv2 pools, via Dune)

interface IData {
  quote_mint: string;
  daily_fees: string;
  daily_protocol_revenue: string;
}

const fetchSolana = async (options: FetchOptions) => {
  const query = getSqlFromFile('helpers/queries/bags.sql', {
    tx_signer: 'BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv',
    start: options.startTimestamp,
    end: options.endTimestamp
  })

  let data: IData[] = [];
  if (options.startOfDay > 1776880000) {
    data = await queryDuneSql(options, query);
  } else {
    const alldata = await queryDuneResult(options, '6926715')
    const targetDate = options.dateString
    data = alldata.filter(
      (row: any) => typeof row.block_date === 'string' && row.block_date.slice(0, 10) === targetDate,
    )
    if(!data || !data.length) {
      throw new Error(`No data found for date ${options.dateString}, fix cache result query`)
    }
  }

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  data.forEach(row => {
    const creatorFees = Number(row.daily_fees) - Number(row.daily_protocol_revenue);
    dailyFees.add(row.quote_mint, Number(row.daily_protocol_revenue), METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.add(row.quote_mint, Number(row.daily_protocol_revenue), METRIC.PROTOCOL_FEES);
    dailyFees.add(row.quote_mint, creatorFees, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(row.quote_mint, Number(creatorFees), METRIC.CREATOR_FEES);
  });

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

// Robinhood Chain (EVM) leg - Bags V1 + V2 launchpads, all pools quoted in WETH

const ROBINHOOD_WETH = ADDRESSES.robinhood.WETH;

interface BagsDeployment {
  factory: string;
  hook: string;
  vault: string;
  deployBlock: number;
  feesSplitEvent: string;
  hookHasPartnerRouting: boolean;
}

const BAGS_DEPLOYMENTS: BagsDeployment[] = [
  {
    // Bags V1 (legacy) factory/hook/vault, e.g. https://robinhoodchain.blockscout.com/address/0x46aD6f53A3C26C8027826e2104cF0595b7b24D40
    factory: '0x46aD6f53A3C26C8027826e2104cF0595b7b24D40',
    hook: '0x208378dDc05eD5De1833624a30EB9C1d26f86EcC',
    vault: '0x26e421917aeA64B615A3127A2BA3AC3051C3ab80',
    // https://robinhoodchain.blockscout.com/block/6191492 (2026-07-10)
    deployBlock: 6191492,
    feesSplitEvent: 'event FeesSplit(address indexed payer, address indexed vault, address indexed feeShare, uint256 vaultFeeQuote, uint256 creatorFeeWETH)',
    hookHasPartnerRouting: false,
  },
  {
    // Bags V2 (current) factory/hook/vault, e.g. https://robinhoodchain.blockscout.com/address/0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37
    factory: '0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37',
    hook: '0x2380aBf72C17aABAb76480244759AC7E2932EEcC',
    vault: '0x4861446aa7fFd9e67a83cBbAcb1A4B70540B83Aa',
    // https://robinhoodchain.blockscout.com/block/7887312 (2026-07-12)
    deployBlock: 7887312,
    feesSplitEvent: 'event FeesSplit(address indexed payer, address indexed vault, address indexed feeShare, uint256 vaultFeeQuote, uint256 creatorFeeWETH, uint256 partnerFeeWETH)',
    hookHasPartnerRouting: true,
  },
];

const VAULT_RECEIVED_EVENT = 'event Received(address indexed from, uint256 amount)';
const HOOK_FEE_TAKEN_EVENT = 'event HookFeeTaken(bytes32 indexed poolId, uint256 amount)';
const POOL_REGISTERED_EVENT = 'event PoolRegistered(bytes32 indexed poolId, address indexed bondingCurve, address indexed feeShare, address partner, uint16 partnerFeeBps)';

const CREATION_FEE_LABEL = 'Token Creation Fees';
const PARTNER_FEE_LABEL = 'Partner Fees';

const eventTopic0 = (eventAbi: string) => ethers.id(ethers.EventFragment.from(eventAbi).format());

const fetchEvm = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const deployment of BAGS_DEPLOYMENTS) {
    // creation fees: vault receipts sent by the factory (from=factory excludes curve/sweep/donation receipts)
    const vaultReceipts = await options.getLogs({
      target: deployment.vault,
      eventAbi: VAULT_RECEIVED_EVENT,
    });
    for (const log of vaultReceipts) {
      if (String(log.from).toLowerCase() !== deployment.factory.toLowerCase()) continue;
      // creation fee is paid in native ETH (vault receive())
      dailyFees.addGasToken(log.amount, CREATION_FEE_LABEL);
      dailyRevenue.addGasToken(log.amount, CREATION_FEE_LABEL);
    }

    // bonding-curve fees: one curve contract per token (thousands, a targets list is impractical),
    // so noTarget scan - the indexed vault topic only ever matches Bags curves, one call per deployment
    const feesSplitLogs = await options.getLogs({
      noTarget: true,
      eventAbi: deployment.feesSplitEvent,
      topics: [eventTopic0(deployment.feesSplitEvent), null as any, ethers.zeroPadValue(deployment.vault, 32)],
    });
    for (const log of feesSplitLogs) {
      const vaultFee = BigInt(log.vaultFeeQuote);
      const creatorFee = BigInt(log.creatorFeeWETH);
      const partnerFee = log.partnerFeeWETH === undefined ? 0n : BigInt(log.partnerFeeWETH);
      dailyFees.add(ROBINHOOD_WETH, vaultFee + creatorFee + partnerFee, METRIC.SWAP_FEES);
      dailyRevenue.add(ROBINHOOD_WETH, vaultFee, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(ROBINHOOD_WETH, creatorFee, METRIC.CREATOR_FEES);
      if (partnerFee > 0n) dailySupplySideRevenue.add(ROBINHOOD_WETH, partnerFee, PARTNER_FEE_LABEL);
    }

    const hookFeeLogs = await options.getLogs({
      target: deployment.hook,
      eventAbi: HOOK_FEE_TAKEN_EVENT,
    });

    // partner/partnerFeeBps are snapshotted at pool registration and immutable afterwards
    const poolConfigs: Record<string, { partner: string; partnerFeeBps: bigint }> = {};
    if (deployment.hookHasPartnerRouting && hookFeeLogs.length) {
      const registrations = await options.getLogs({
        target: deployment.hook,
        eventAbi: POOL_REGISTERED_EVENT,
        fromBlock: deployment.deployBlock,
        cacheInCloud: true,
      });
      for (const log of registrations) {
        poolConfigs[String(log.poolId)] = { partner: String(log.partner), partnerFeeBps: BigInt(log.partnerFeeBps) };
      }
    }

    for (const log of hookFeeLogs) {
      const grossFee = BigInt(log.amount);
      // 50/50 split; partner (if set) takes partnerFeeBps of the protocol half - verified against on-chain FeesSwept distributions
      const protocolHalf = grossFee / 2n;
      const creatorHalf = grossFee - protocolHalf;
      let partnerCut = 0n;
      if (deployment.hookHasPartnerRouting) {
        const pool = poolConfigs[String(log.poolId)];
        // registration always precedes fee accrual - a missing entry means broken log data, fail fast
        if (!pool) throw new Error(`launch-on-bags: no PoolRegistered event found for pool ${log.poolId}`);
        if (pool.partner !== ethers.ZeroAddress) {
          partnerCut = protocolHalf * pool.partnerFeeBps / 10000n;
        }
      }
      dailyFees.add(ROBINHOOD_WETH, grossFee, METRIC.SWAP_FEES);
      dailyRevenue.add(ROBINHOOD_WETH, protocolHalf - partnerCut, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(ROBINHOOD_WETH, creatorHalf, METRIC.CREATOR_FEES);
      if (partnerCut > 0n) dailySupplySideRevenue.add(ROBINHOOD_WETH, partnerCut, PARTNER_FEE_LABEL);
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  // Dune-based Solana leg forces version 1 (v1 has no pullHourly)
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Bags pools are also tracked by the Meteora adapters (Solana) and Uniswap v4 (Robinhood Chain)
  adapter: {
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2025-05-10' },
    // V1 factory deployed 2026-07-10 at block 6191492: https://robinhoodchain.blockscout.com/block/6191492
    [CHAIN.ROBINHOOD]: { fetch: fetchEvm, start: '2026-07-10' },
  },
  methodology: {
    Fees: "On Solana: total trading fees paid by users when swapping against Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration), excluding the underlying Meteora protocol fee, DAMMv2 LP fees and any referral fees. On Robinhood Chain: token creation fees plus gross trading fees charged on Bags bonding-curve swaps (pre-migration) and Uniswap v4 hook swaps (post-migration) across the V1 and V2 deployments.",
    SupplySideRevenue: "Creator fees paid to token creators, plus (on Robinhood Chain V2) the partner/referrer share carved out of the protocol half of trading fees.",
    Revenue: "Bags' net share: on Solana, trading-fee revenue from DBC (pre-migration) and DAMMv2 (post-migration); on Robinhood Chain, token creation fees plus the protocol share of trading fees (50% of gross, minus the partner cut on V2 pools with a partner).",
    ProtocolRevenue: "Net revenue earned by the Bags protocol from trading and token-creation activity."
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.CREATOR_FEES]: 'Creator fees to token creators from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration) on Solana.',
      [METRIC.PROTOCOL_FEES]: 'Protocol fees to Bags protocol from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration) on Solana.',
      [METRIC.SWAP_FEES]: 'Gross trading fees charged on Robinhood Chain bonding-curve swaps and post-migration Uniswap v4 hook swaps.',
      [CREATION_FEE_LABEL]: 'Token creation fees paid to the Bags vault on each Robinhood Chain token launch.',
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: 'Creator share of trading fees: Bags DBC/DAMMv2 pools on Solana, and 50% of bonding-curve and hook trading fees on Robinhood Chain (on V1 the partner/referrer cut is carved out of this share downstream).',
      [PARTNER_FEE_LABEL]: 'Partner/referrer share on Robinhood Chain V2: partnerFeeBps (default 25%) of the protocol half of trading fees.',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol share of trading fees kept by Bags: DBC/DAMMv2 fees on Solana, and the protocol half of Robinhood Chain trading fees net of the V2 partner cut.',
      [CREATION_FEE_LABEL]: 'Token creation fees paid to the Bags vault on each Robinhood Chain token launch.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol share of trading fees kept by Bags: DBC/DAMMv2 fees on Solana, and the protocol half of Robinhood Chain trading fees net of the V2 partner cut.',
      [CREATION_FEE_LABEL]: 'Token creation fees paid to the Bags vault on each Robinhood Chain token launch.',
    },
  }
}

export default adapter
