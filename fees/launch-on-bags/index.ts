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
    dailyProtocolRevenue: dailyProtocolRevenue.clone(),
  };
};

// Robinhood Chain (EVM) leg - Bags V1 + V2 launchpads (all pools quoted in WETH) and the V3 launchpad

const ROBINHOOD_WETH = ADDRESSES.robinhood.WETH;

interface BagsPool {
  quote: string;
  partner: string;
  partnerFeeBps: bigint;
}

interface BagsV3Pool extends BagsPool {
  buyFeeBps: bigint;
  sellFeeBps: bigint;
  protocolBuyFeeBps: bigint;
  protocolSellFeeBps: bigint;
}

interface BagsDeployment {
  factory: string;
  hook: string;
  vault: string;
  deployBlock: number;
  feesSplitEvent: string;
  creatorFeeField: 'creatorFeeWETH' | 'creatorFeeQuote';
  // V1's FeesSplit has no partner leg
  partnerFeeField?: 'partnerFeeWETH' | 'partnerFeeQuote';
  hookFeeEvent: string;
  // V2/V3: hook registration, emitted in the launch tx; V3's also carries the quote asset and fee rates
  poolRegisteredEvent?: string;
  // V1: factory TokenCreated.curve is the FeesSplit allowlist
  tokenCreatedEvent?: string;
  perLaunchFees: boolean;
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
    creatorFeeField: 'creatorFeeWETH',
    hookFeeEvent: 'event HookFeeTaken(bytes32 indexed poolId, uint256 amount)',
    tokenCreatedEvent: 'event TokenCreated(address indexed token, address indexed curve, address indexed creator, address feeShare, bytes32 poolId, string name, string symbol, string metadataURI)',
    perLaunchFees: false,
  },
  {
    // Bags V2 (current) factory/hook/vault, e.g. https://robinhoodchain.blockscout.com/address/0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37
    factory: '0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37',
    hook: '0x2380aBf72C17aABAb76480244759AC7E2932EEcC',
    vault: '0x4861446aa7fFd9e67a83cBbAcb1A4B70540B83Aa',
    // https://robinhoodchain.blockscout.com/block/7887312 (2026-07-12)
    deployBlock: 7887312,
    feesSplitEvent: 'event FeesSplit(address indexed payer, address indexed vault, address indexed feeShare, uint256 vaultFeeQuote, uint256 creatorFeeWETH, uint256 partnerFeeWETH)',
    creatorFeeField: 'creatorFeeWETH',
    partnerFeeField: 'partnerFeeWETH',
    hookFeeEvent: 'event HookFeeTaken(bytes32 indexed poolId, uint256 amount)',
    poolRegisteredEvent: 'event PoolRegistered(bytes32 indexed poolId, address indexed bondingCurve, address indexed feeShare, address partner, uint16 partnerFeeBps)',
    perLaunchFees: false,
  },
  {
    // standalone V3 deployment; each launch snapshots its own quote and fee tuple
    // Bags V3 factory/hook/vault, e.g. https://robinhoodchain.blockscout.com/address/0xC4210279fB1e1dE24A87d6F5Cc597c9422Aef899
    factory: '0xC4210279fB1e1dE24A87d6F5Cc597c9422Aef899',
    hook: '0x22E9A027e14769d4cd28B6C7240B36b1dBB26eCC',
    vault: '0x24eD44bEDEAc6708A0049dA8d43CB55471eb7D08',
    // https://robinhoodchain.blockscout.com/block/54594936 (2026-09-04)
    deployBlock: 54594936,
    // same topic0 as V2 FeesSplit; the indexed vault topic keeps the two noTarget scans apart
    feesSplitEvent: 'event FeesSplit(address indexed payer, address indexed vault, address indexed feeShare, uint256 vaultFeeQuote, uint256 creatorFeeQuote, uint256 partnerFeeQuote)',
    creatorFeeField: 'creatorFeeQuote',
    partnerFeeField: 'partnerFeeQuote',
    hookFeeEvent: 'event HookFeeTaken(bytes32 indexed poolId, uint256 amount, bool isBuy)',
    poolRegisteredEvent: 'event PoolRegistered(bytes32 indexed poolId, address indexed bondingCurve, address indexed feeShare, address partner, uint16 partnerFeeBps, address quoteCurrency, tuple(uint16 buyFeeBps, uint16 sellFeeBps, uint16 protocolBuyFeeBps, uint16 protocolSellFeeBps) fees)',
    perLaunchFees: true,
  },
];

const VAULT_RECEIVED_EVENT = 'event Received(address indexed from, uint256 amount)';

const CREATION_FEE_LABEL = 'Token Creation Fees';
const PARTNER_FEE_LABEL = 'Partner Fees';

const eventTopic0 = (eventAbi: string) => ethers.id(ethers.EventFragment.from(eventAbi).format());

const fetchEvm = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const toBlock = await options.getToBlock();
  if (!toBlock) throw new Error('launch-on-bags: could not resolve the end block of the period');

  for (const deployment of BAGS_DEPLOYMENTS) {
    if (toBlock < deployment.deployBlock) continue;

    // from=factory: vault Received is also used for other inflows; restrict to factory-paid creation fees (native ETH)
    const vaultReceipts = await options.getLogs({
      target: deployment.vault,
      eventAbi: VAULT_RECEIVED_EVENT,
    });
    for (const log of vaultReceipts) {
      if (String(log.from).toLowerCase() !== deployment.factory.toLowerCase()) continue;
      dailyFees.addGasToken(log.amount, CREATION_FEE_LABEL);
      dailyRevenue.addGasToken(log.amount, CREATION_FEE_LABEL);
    }

    // one bonding curve per token, so thousands of emitters: scan topic0 + indexed vault instead of listing every curve
    // onlyArgs: false keeps the emitter, which must be a registered Bags curve: an unknown emitter throws so a
    // registry gap (e.g. a new hook) fails loudly instead of silently under-counting
    const feesSplitLogs = await options.getLogs({
      noTarget: true,
      eventAbi: deployment.feesSplitEvent,
      topics: [eventTopic0(deployment.feesSplitEvent), null as any, ethers.zeroPadValue(deployment.vault, 32)],
      onlyArgs: false,
    });

    const hookFeeLogs = await options.getLogs({
      target: deployment.hook,
      eventAbi: deployment.hookFeeEvent,
    });

    const pools: Record<string, BagsPool | BagsV3Pool> = {};
    const quoteByCurve: Record<string, string> = {};

    if (deployment.poolRegisteredEvent && (hookFeeLogs.length > 0 || feesSplitLogs.length > 0)) {
      const registrations = await options.getLogs({
        target: deployment.hook,
        eventAbi: deployment.poolRegisteredEvent,
        fromBlock: deployment.deployBlock,
        cacheInCloud: true,
      });
      for (const log of registrations) {
        // ETH launches register WETH, never address(0)
        const quote = deployment.perLaunchFees ? String(log.quoteCurrency) : ROBINHOOD_WETH;
        const pool: BagsPool | BagsV3Pool = deployment.perLaunchFees
          ? {
              quote,
              partner: String(log.partner),
              partnerFeeBps: BigInt(log.partnerFeeBps),
              buyFeeBps: BigInt(log.fees.buyFeeBps),
              sellFeeBps: BigInt(log.fees.sellFeeBps),
              protocolBuyFeeBps: BigInt(log.fees.protocolBuyFeeBps),
              protocolSellFeeBps: BigInt(log.fees.protocolSellFeeBps),
            }
          : {
              quote,
              partner: String(log.partner),
              partnerFeeBps: BigInt(log.partnerFeeBps),
            };
        pools[String(log.poolId)] = pool;
        quoteByCurve[String(log.bondingCurve).toLowerCase()] = quote;
      }
    } else if (deployment.tokenCreatedEvent && feesSplitLogs.length > 0) {
      const created = await options.getLogs({
        target: deployment.factory,
        eventAbi: deployment.tokenCreatedEvent,
        fromBlock: deployment.deployBlock,
        cacheInCloud: true,
      });
      for (const log of created) {
        quoteByCurve[String(log.curve).toLowerCase()] = ROBINHOOD_WETH;
      }
    }

    for (const log of feesSplitLogs) {
      const quote = quoteByCurve[String(log.address).toLowerCase()];
      if (!quote) throw new Error(`launch-on-bags: FeesSplit from unregistered curve ${log.address} (vault ${deployment.vault}, tx ${log.transactionHash})`);
      const args = log.args;
      const vaultFee = BigInt(args.vaultFeeQuote);
      const creatorFee = BigInt(args[deployment.creatorFeeField]);
      const partnerFee = deployment.partnerFeeField ? BigInt(args[deployment.partnerFeeField]) : 0n;
      dailyFees.add(quote, vaultFee + creatorFee + partnerFee, METRIC.SWAP_FEES);
      dailyRevenue.add(quote, vaultFee, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(quote, creatorFee, METRIC.CREATOR_FEES);
      if (partnerFee > 0n) dailySupplySideRevenue.add(quote, partnerFee, PARTNER_FEE_LABEL);
    }

    for (const log of hookFeeLogs) {
      const pool = pools[String(log.poolId)];
      // registration always precedes fee accrual, so a missing entry is a bug, not a late register
      if (deployment.poolRegisteredEvent && !pool) throw new Error(`launch-on-bags: no PoolRegistered event found for pool ${log.poolId}`);
      const grossFee = BigInt(log.amount);
      let protocolPart: bigint;
      let partnerCut = 0n;
      if (deployment.perLaunchFees) {
        const v3Pool = pool as BagsV3Pool;
        const [sideBps, protocolSideBps] = log.isBuy
          ? [v3Pool.buyFeeBps, v3Pool.protocolBuyFeeBps]
          : [v3Pool.sellFeeBps, v3Pool.protocolSellFeeBps];
        protocolPart = grossFee * protocolSideBps / sideBps;
        // hook floors the partner cut once per sweep; adapter floors per take (under 1 wei per take)
        if (v3Pool.partner !== ethers.ZeroAddress) {
          partnerCut = protocolPart * v3Pool.partnerFeeBps / 10000n;
        }
      } else {
        // V1/V2 50/50 split verified against on-chain FeesSwept
        protocolPart = grossFee / 2n;
        if (pool && pool.partner !== ethers.ZeroAddress) {
          partnerCut = protocolPart * pool.partnerFeeBps / 10000n;
        }
      }
      const quote = pool?.quote ?? ROBINHOOD_WETH;
      dailyFees.add(quote, grossFee, METRIC.SWAP_FEES);
      dailyRevenue.add(quote, protocolPart - partnerCut, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(quote, grossFee - protocolPart, METRIC.CREATOR_FEES);
      if (partnerCut > 0n) dailySupplySideRevenue.add(quote, partnerCut, PARTNER_FEE_LABEL);
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
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
    Fees: "On Solana: total trading fees paid by users when swapping against Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration), excluding the underlying Meteora protocol fee, DAMMv2 LP fees and any referral fees. On Robinhood Chain: token creation fees plus gross trading fees charged on Bags bonding-curve swaps (pre-migration) and Uniswap v4 hook swaps (post-migration) across the V1, V2 and V3 deployments. V1/V2 pools are quoted in WETH; each V3 launch sets its own 1-10% buy and sell fees, and its fees are counted in its quote asset: WETH or an allowlisted ERC-20 (e.g. tokenized stocks).",
    SupplySideRevenue: "Creator fees paid to token creators, plus (on Robinhood Chain V2 and V3) the partner/referrer share carved out of the protocol share of trading fees.",
    Revenue: "Bags' net share: on Solana, trading-fee revenue from DBC (pre-migration) and DAMMv2 (post-migration); on Robinhood Chain, token creation fees plus the protocol share of trading fees net of the partner cut: 50% of gross on V1/V2 (partner cut on V2 pools with a partner), and on V3 max(20% of the fee, 0.5% of volume) per side, minus a partner cut of the launch's snapshotted partnerFeeBps (25% by default) of that share on pools with a partner.",
    ProtocolRevenue: "Net revenue earned by the Bags protocol from trading and token-creation activity."
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.CREATOR_FEES]: 'Creator fees to token creators from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration) on Solana.',
      [METRIC.PROTOCOL_FEES]: 'Protocol fees to Bags protocol from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration) on Solana.',
      [METRIC.SWAP_FEES]: 'Gross trading fees charged on Robinhood Chain bonding-curve swaps and post-migration Uniswap v4 hook swaps: in WETH on V1/V2, and on V3 in each launch\'s quote asset (WETH or an allowlisted ERC-20) at its own 1-10% buy and sell rates.',
      [CREATION_FEE_LABEL]: 'Token creation fees paid to the Bags vault on each Robinhood Chain token launch.',
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: 'Creator share of trading fees: Bags DBC/DAMMv2 pools on Solana, and on Robinhood Chain 50% of bonding-curve and hook trading fees on V1/V2 (on V1 the partner/referrer cut is carved out of this share downstream) and the trading fee minus the protocol share on V3.',
      [PARTNER_FEE_LABEL]: 'Partner/referrer share on Robinhood Chain V2 and V3: partnerFeeBps (default 25%) of the protocol share of trading fees (the protocol half on V2).',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol share of trading fees kept by Bags: DBC/DAMMv2 fees on Solana, and on Robinhood Chain the protocol half of V1/V2 trading fees and the V3 protocol share (max of 20% of the fee and 0.5% of volume, per side), net of the V2/V3 partner cut.',
      [CREATION_FEE_LABEL]: 'Token creation fees paid to the Bags vault on each Robinhood Chain token launch.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol share of trading fees kept by Bags: DBC/DAMMv2 fees on Solana, and on Robinhood Chain the protocol half of V1/V2 trading fees and the V3 protocol share (max of 20% of the fee and 0.5% of volume, per side), net of the V2/V3 partner cut.',
      [CREATION_FEE_LABEL]: 'Token creation fees paid to the Bags vault on each Robinhood Chain token launch.',
    },
  }
}

export default adapter
