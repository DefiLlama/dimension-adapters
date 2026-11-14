import { Balances, ChainApi } from '@defillama/sdk';
import { EventFragment, zeroPadValue } from 'ethers';
import { FetchGetLogsOptions, FetchOptions } from '../../adapters/types';
import { toPositionedLogArgs } from '../../helpers/logs';
import { CONTRACT } from './config';

export const lowercase = (value: any): string => String(value).toLowerCase();

export const toBigInt = (value: any): bigint => BigInt(value.toString());

export type HookrLog = {
  args: Record<string, any>;
  address: string;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
};

/** Preserve same-transaction ordering when replaying fee changes, funding and burns. */
export const compareLogPosition = (firstLog: HookrLog, secondLog: HookrLog) =>
  firstLog.blockNumber - secondLog.blockNumber || firstLog.logIndex - secondLog.logIndex;

export const addressTopic = (address: string) => zeroPadValue(address, 32);

export const eventTopic = (eventAbi: string) => EventFragment.from(eventAbi).topicHash;

export const ABI = {
  swap:
    'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,' +
    'uint128 liquidity,int24 tick,uint24 fee)',
  transfer: 'event Transfer(address indexed from,address indexed to,uint256 value)',
  allocated:
    'event FeesAllocated(bytes32 indexed id,address indexed quote,uint256 protocol,uint256 royalty,' +
    'uint256 refund,address advisoryRecipient,uint256 advisoryFee)',
  recapture:
    'event RecaptureSplit(bytes32 indexed id,address indexed trader,uint256 traderAmount,uint256 lp,' +
    'uint256 pot,uint256 protocol,address currency,uint256 reportedProfit)',
  correction:
    'event CorrectionSucceeded(bytes32 indexed id,uint8 indexed phase,address indexed trader,' +
    'uint256 reportedProfit,uint256 pushed,address currency)',
  partner:
    'event ProfitRecaptured(bytes32 indexed poolId,address indexed currency,uint256 treasuryAmount,' +
    'uint256 hookAmount)',
  oldPartner:
    'event ArbitrageProfitSplit(address indexed profitCurrency,address indexed trader,address indexed creator,' +
    'uint256 totalProfit,uint256 traderAmount,uint256 creatorAmount,uint256 triggerPoolAmount,' +
    'uint256 wthProtocolAmount,uint256 hookrProtocolAmount)',
};

export type FeeSource = {
  fees: string;
  revenue?: string;
  supplySide?: string;
  description: string;
};

// A missing destination means this source never pays it. These same labels generate the methodology.
export const SOURCES = {
  direct: {
    fees: 'Hook Swap Charges',
    revenue: 'Hook Swap Charges To Hookr',
    supplySide: 'Hook Swap Charges To Creators And Advisories',
    description:
      'Hookr quote charges allocated to the protocol, creators, integrators and advisories; refundable amounts ' +
      'and tax-queue credits awaiting settlement are excluded.',
  },
  recapture: {
    fees: 'Recaptured Arbitrage',
    revenue: 'Recaptured Arbitrage To Hookr',
    supplySide: 'Recaptured Arbitrage To Traders, LPs And Executors',
    description:
      'Realized arbitrage distributed through authenticated Hookr corrections, including the executor’s ' +
      'separately retained leg in its actual payment currency.',
  },
  tax: {
    fees: 'Tax And Conversion Settlements',
    revenue: 'Tax And Conversion To Hookr',
    supplySide: 'Tax And Conversion To Creators',
    description:
      'Directional-tax income when its queue books a settlement or pays ERC-6909 claims; the earlier credit and ' +
      'later collection are not counted again.',
  },
  lp: {
    fees: 'Additional LP Swap Fees',
    supplySide: 'Additional Swap Fees To LPs And Uniswap',
    description:
      'Hookr-added LP fee components attributed from realized swap inputs and fee rates above each pool’s frozen ' +
      'ordinary base fee, accounting for Uniswap protocol fees; excludes ordinary base LP fees.',
  },
  subject: {
    fees: 'Subject Token Burn Charges',
    supplySide: 'Subject Token Burns For Pool Participants',
    description:
      'Current and modular subject-token Auto Burn charges and legacy collected LP subject fees burned for that ' +
      'pool’s participants, excluding HOOKR itself.',
  },
  directBurn: {
    fees: 'HOOKR Token Burn Charges',
    revenue: 'HOOKR Token Fees Burned For Holders',
    description:
      'Fees charged and burned directly in HOOKR, benefiting this protocol’s holders; arbitrary inventory burns ' +
      'are excluded.',
  },
  legacy: {
    fees: 'Legacy Launch And Trading Fees',
    revenue: 'Legacy Launch And Trading Fees To Hookr',
    supplySide: 'Legacy Trading Fees To Creators',
    description:
      'Generation 3–5 creation and curve charges and legacy LP fees when booked; retained income is the change ' +
      'in protocol fee balances plus withdrawals, including guard withholding.',
  },
  v2: {
    fees: 'Modular Hook Charges',
    revenue: 'Modular Hook Charges To Hookr',
    supplySide: 'Modular Hook Charges To Creators And Pool Participants',
    description:
      'Modular native-mechanics protocol accruals and supplier quote allocations; net subject-token burns are ' +
      'measured separately in the actual subject currency.',
  },
  launch: {
    fees: 'Launch And Root Deployment Fees',
    revenue: 'Launch And Deployment Fees To Hookr',
    description: 'Fees actually paid to launch pools and deploy owned roots.',
  },
  tokenizer: {
    fees: 'Revenue Tokenizer Fees',
    revenue: 'Revenue Tokenizer Fees To Hookr',
    supplySide: 'Revenue Tokenizer Fees To Execution Partner',
    description:
      'Original tokenizer collector income as it vests, with the documented 20% execution-partner obligation ' +
      'deducted, plus actual delivery fees from the newer tokenizer.',
  },
  flywheel: {
    fees: 'Legacy Flywheel Charges',
    revenue: 'Legacy Flywheel Charges For HOOKR Burns',
    description:
      'Generation-5 user charges irrevocably credited to the dedicated HOOKR market-buyback burner.',
  },
  vault: {
    fees: 'Liquidity Vault Performance Fees',
    revenue: 'Liquidity Vault Performance Fees To Hookr',
    description:
      'Performance fees charged on realized liquidity-vault earnings, excluding deposited principal.',
  },
} as const satisfies Record<string, FeeSource>;

export type Source = keyof typeof SOURCES;

export const RETAINED = 'Hookr Retained Fee Income';

export const HOLDERS = {
  jar: 'Fee Assets Exchanged For HOOKR Burns',
  legacy: 'Legacy HOOKR Market Buybacks',
  openzaps: 'OpenZaps Funded HOOKR Market Buybacks',
  direct: 'HOOKR Token Fees Burned For Holders',
};

/** Keep raw token units; the zero address denotes native ETH, not an ERC-20. */
export function addCurrency(balance: Balances, currency: string, amount: bigint, label: string) {
  // SDK Balances accepts the zero address for native ETH as well as ERC-20 addresses.
  if (amount !== 0n) {
    balance.add(lowercase(currency), amount.toString(), label);
  }
}

/** Share the five metric balances and their allocation rules across Hookr's fee sources. */
export class FeeAccounting {
  // This is also the fetch result; pricing remains the runner's responsibility.
  readonly balances = {
    dailyFees: this.options.createBalances(),
    dailyRevenue: this.options.createBalances(),
    dailySupplySideRevenue: this.options.createBalances(),
    dailyProtocolRevenue: this.options.createBalances(),
    dailyHoldersRevenue: this.options.createBalances(),
  };
  openingApi: ChainApi;

  constructor(
    public options: FetchOptions,
    public fromBlock: number,
    public toBlock: number,
  ) {
    // getFromBlock is the first INCLUDED block. fromApi is pinned to that block too,
    // so a cumulative-counter opening snapshot must explicitly read the preceding block.
    this.openingApi = new ChainApi({ chain: options.chain, block: fromBlock - 1 });
  }

  /** Book gross fees once, splitting the same token amount between Hookr and suppliers. */
  recordFees(source: Source, currency: string, gross: bigint, revenue: bigint) {
    if (gross < 0n || revenue < 0n || revenue > gross) {
      throw new Error(`Hookr: invalid ${source} allocation`);
    }

    const labels: FeeSource = SOURCES[source];
    const supplierAmount = gross - revenue;
    if ((revenue > 0n && !labels.revenue) || (supplierAmount > 0n && !labels.supplySide)) {
      throw new Error(`Hookr: unexpected destination for ${source}`);
    }
    addCurrency(this.balances.dailyFees, currency, gross, labels.fees);
    if (labels.revenue) {
      addCurrency(this.balances.dailyRevenue, currency, revenue, labels.revenue);
    }
    if (labels.supplySide) {
      addCurrency(this.balances.dailySupplySideRevenue, currency, supplierAmount, labels.supplySide);
    }
    addCurrency(this.balances.dailyProtocolRevenue, currency, revenue, RETAINED);
  }

  /** Remove fee-funded burn allocations from retained income; holder income waits for the burn. */
  recordBurnFunding(currency: string, amount: bigint) {
    if (amount < 0n) {
      throw new Error('Hookr: negative burn allocation');
    }

    // Net capital allocations against the SAME retained-income label, not a negative expense row.
    addCurrency(this.balances.dailyProtocolRevenue, currency, -amount, RETAINED);
  }

  /** Classify fee burns by whose token is retired: HOOKR holders or another pool's participants. */
  recordSubjectBurn(currency: string, amount: bigint) {
    if (lowercase(currency) !== CONTRACT.hookr) {
      return this.recordFees('subject', currency, amount, 0n);
    }

    // A fee burned in HOOKR itself benefits this protocol's holders, unlike other launched subjects.
    this.recordFees('directBurn', currency, amount, amount);
    this.recordBurnFunding(currency, amount);
    addCurrency(this.balances.dailyHoldersRevenue, currency, amount, HOLDERS.direct);
  }

  /** Fetch targeted logs with the position, emitter and transaction needed for provenance checks. */
  async getLogs(targets: string[], eventAbi: string, extra: FetchGetLogsOptions = {}): Promise<HookrLog[]> {
    const fromBlock = extra.fromBlock ?? this.fromBlock;
    if (!targets.length || fromBlock > this.toBlock) {
      return [];
    }

    const logs = await this.options.getLogs({
      targets,
      eventAbi,
      onlyArgs: false,
      fromBlock,
      toBlock: this.toBlock,
      ...extra,
    });
    const allowed = new Set(targets.map(lowercase));

    return logs
      .map(log => {
        // Reuse the repository's position validation, retaining the transaction and emitter too.
        const { blockNumber, logIndex } = toPositionedLogArgs(log);
        const transactionHash = lowercase(log.transactionHash ?? log.transaction_hash);
        if (!allowed.has(lowercase(log.address)) || !/^0x[0-9a-f]{64}$/.test(transactionHash)) {
          throw new Error('Hookr: malformed or unscoped event');
        }

        return {
          args: log.args,
          address: lowercase(log.address),
          transactionHash,
          blockNumber,
          logIndex,
        };
      })
      .sort(compareLogPosition);
  }
}
