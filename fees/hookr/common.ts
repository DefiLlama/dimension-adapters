import ADDRESSES from '../../helpers/coreAssets.json';
import { Balances, ChainApi } from '@defillama/sdk';
import { EventFragment, zeroPadValue } from 'ethers';
import { FetchGetLogsOptions, FetchOptions } from '../../adapters/types';
import { toPositionedLogArgs } from '../../helpers/logs';

// Verified sources and deployment records: https://github.com/Hookr-fun/hookr-contracts
// Earlier releases: https://hookr.fun/docs/previous-releases
export const NATIVE = ADDRESSES.null;

// Deployment blocks, used as the start of history scans.
export const BLOCK = {
  registry: 82269732,
  oldTokenizer: 92671598,
  newTokenizer: 107699158,
};

export const CONTRACT = {
  hookr: '0x18e674231a58c239dc7daedcffe15ec3a24cff5c', // HOOKR token
  root: '0x89c9fb50d1f03192230ffb1c279bb6e7d3fe6acc', // first Hookr 1 root
  registry: '0x463c82bea1a52f4cc05ca0741a24f0ad24ba4602', // registers every later Hookr 1 root
  treasury: '0x2242f7fc75606500503075f29ea8cda684efb4a9', // treasury forwarder, protocolRecipient of Hookr's Rules
  split: '0xe50df7069cac7b4f1ca63d79d26940dba35e5abb', // 50/50 revenue split (Safe + burn jar), treasury target since 2026-10-31
  jar: '0xb4c20b8245440a3c489991a01a306d33b09047ca', // burn jar: hands its assets to whoever burns the required HOOKR
  launcher: '0x1cf2748a6670572425eabf9ab9e5bc4eb2eb8ef4',
  rootFactory: '0xa6c2a401597301dff57a59bc8f70a9622499f3ec',
  liquidityVault: '0xa408923ef811945ef119bc700b1950dab65467fc',
  oldTokenizer: '0xfb3c1501c727f30883cd7b36ec380381af7412ef',
  oldLegCollector: '0x7d79010cf29e548b55224f0ceedaed2275d65781', // Hookr's fee leg on original revenue tokens
  newTokenizer: '0x08de138e558a9258c6b4077e8bdeb9ad1fb46a4b',
  v2Registry: '0x5b7f1a117a83aaac15b0698aa4eb9d53fe5f5ba3', // earlier modular release
  mechanics: '0xd700492b504ba5a72d7de28dde11cd7985a7f1ae', // earlier modular release fee module
  legacyHook: '0xe7c3461a4c762ff9db4f91bee3cf8deaafc2e8cc', // generation-5 hook (flywheel charge)
  poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', // Uniswap v4
};

// Roots of the earlier modular release; its pools count only when hosted by one of these.
export const OLD_ROOTS = [
  '0xb3ca29cf721380cee8b8e4755f3865ebc68fe8cc',
  '0xb914f955294799de4b891bd2ea8af628fa1c68cc',
  '0xc7c516cd5546bcb2592fe3f8aa91c2a4ba3768cc',
  '0xa99902a2922014bbe2bf2dcf15742ac5104828cc',
  '0xe5429db8f63912e632e86733905667aaeb6ea8cc',
];

// Executors of the Hookr arbitrage integration that emit ArbitrageProfitSplit (also in fees/what-the-hook.ts).
// All 4,080 splits they emitted between 2026-09-01 and 2026-11-20 pair with a successful correction on an OLD_ROOTS root.
export const ARB_EXECUTORS = [
  '0xc356cf51134e0df02bfe880115dd8c66ead45803',
  '0x8d18dddedd529b7f9d90e65e75408ba2290ab276', // 2026-09-11 pilot
  '0x45dce9f6e01478dc2d5edcf093eae0c0adb043bc', // 2026-09-12 pilot
  '0x4650eeeb8093de5412246a4fbd7d08798fd0ec22', // listed by What The Hook, no splits yet
];

type FeeSource = { fees: string; revenue?: string; supplySide?: string; description: string };

// Each fee source's labels. A missing destination means the source never pays it.
export const SOURCES = {
  swap: {
    fees: 'Hook Swap Charges',
    revenue: 'Hook Swap Charges To Hookr',
    supplySide: 'Hook Swap Charges To Creators, Integrators And Advisories',
    description:
      'Fees that Hook Blocks charge on swaps in Hookr pools, shared between Hookr, the pool creator, integrator apps ' +
      'and advisory contracts. Token taxes are counted when they settle, under Tax And Conversion.',
  },
  tax: {
    fees: 'Tax And Conversion Settlements',
    revenue: 'Tax And Conversion To Hookr',
    supplySide: 'Tax And Conversion To Creators',
    description: 'Buy and sell taxes collected by the Tax + Conversion Hook Block, counted once when they are settled.',
  },
  recapture: {
    fees: 'Recaptured Arbitrage',
    revenue: 'Recaptured Arbitrage To Hookr',
    supplySide: 'Recaptured Arbitrage To Traders, LPs And Creators',
    description:
      'Arbitrage profit captured in Hookr pools by the What The Hook integration and shared with traders, LPs, pool ' +
      'creators and Hookr. The share What The Hook keeps is excluded; it is counted in its own listing.',
  },
  subject: {
    fees: 'Subject Token Burn Charges',
    supplySide: 'Subject Token Burns For Pool Participants',
    description: "Fees taken in a pool's own launched token and burned, which benefits that token's holders.",
  },
  hookrBurn: {
    fees: 'HOOKR Token Burn Charges',
    revenue: 'HOOKR Token Fees Burned For Holders',
    description: 'Fees taken in HOOKR in HOOKR pools and burned.',
  },
  launch: {
    fees: 'Launch And Root Deployment Fees',
    revenue: 'Launch And Deployment Fees To Hookr',
    description: 'Fees paid to launch a pool or deploy an owned root.',
  },
  vault: {
    fees: 'Liquidity Vault Performance Fees',
    revenue: 'Liquidity Vault Performance Fees To Hookr',
    description: 'Performance fee taken from the LP fees earned by the liquidity vault.',
  },
  tokenizer: {
    fees: 'Revenue Tokenizer Fees',
    revenue: 'Revenue Tokenizer Fees To Hookr',
    supplySide: 'Revenue Tokenizer Fees To Execution Partner',
    description:
      "Hookr's fee on income paid to revenue tokens. On the original tokenizer 20% of it is owed to What The Hook, " +
      'the execution partner.',
  },
  modular: {
    fees: 'Modular Hook Charges',
    revenue: 'Modular Hook Charges To Hookr',
    supplySide: 'Modular Hook Charges To Creators And Pool Participants',
    description: 'Swap fees charged by pools of the earlier modular Hookr release.',
  },
  legacy: {
    fees: 'Legacy Launch And Trading Fees',
    revenue: 'Legacy Launch And Trading Fees To Hookr',
    supplySide: 'Legacy Trading Fees To Creators',
    description:
      'Launch fees, bonding-curve trading fees and pool fees of the generation 3 to 5 Hookr launchpads, shared ' +
      'between Hookr and token creators.',
  },
  flywheel: {
    fees: 'Legacy Flywheel Charges',
    revenue: 'Legacy Flywheel Charges For HOOKR Burns',
    description: 'Generation 5 swap charge sent to the HOOKR buy-and-burn contract.',
  },
} satisfies Record<string, FeeSource>;

export type Source = keyof typeof SOURCES;

export const RETAINED = 'Hookr Retained Fee Income';

// Holders revenue is only Hookr fee income allocated to HOOKR burns, counted when allocated (at the fee source).
export const HOLDERS = {
  jar: 'Fees Allocated To HOOKR Burn Jar',
  flywheel: SOURCES.flywheel.revenue,
  direct: SOURCES.hookrBurn.revenue,
};

export type HookrLog = {
  args: Record<string, any>;
  address: string;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
};

export const lowercase = (value: any): string => String(value).toLowerCase();
export const toBigInt = (value: any): bigint => BigInt(value.toString());
export const byPosition = (a: HookrLog, b: HookrLog) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
export const eventTopic = (eventAbi: string) => EventFragment.from(eventAbi).topicHash;
export const addressTopic = (address: string) => zeroPadValue(address, 32);

/** Raw token units; the zero address is native ETH. */
export function addCurrency(balance: Balances, currency: string, amount: bigint, label: string) {
  if (amount !== 0n) balance.add(lowercase(currency), amount.toString(), label);
}

export class FeeAccounting {
  readonly balances: Record<
    'dailyFees' | 'dailyRevenue' | 'dailySupplySideRevenue' | 'dailyProtocolRevenue' | 'dailyHoldersRevenue',
    Balances
  >;
  readonly openingApi: ChainApi; // state just before the window, for counters read at both ends

  constructor(readonly options: FetchOptions, readonly fromBlock: number, readonly toBlock: number) {
    this.balances = {
      dailyFees: options.createBalances(),
      dailyRevenue: options.createBalances(),
      dailySupplySideRevenue: options.createBalances(),
      dailyProtocolRevenue: options.createBalances(),
      dailyHoldersRevenue: options.createBalances(),
    };
    this.openingApi = new ChainApi({ chain: options.chain, block: fromBlock - 1 });
  }

  /** Book a fee once: `revenue` of it is Hookr's, the rest goes to the source's supply side. */
  recordFees(source: Source, currency: string, gross: bigint, revenue: bigint) {
    if (gross < 0n || revenue < 0n || revenue > gross) throw new Error(`Hookr: invalid ${source} split`);
    const labels: FeeSource = SOURCES[source];
    addCurrency(this.balances.dailyFees, currency, gross, labels.fees);
    if (labels.revenue) addCurrency(this.balances.dailyRevenue, currency, revenue, labels.revenue);
    if (labels.supplySide) addCurrency(this.balances.dailySupplySideRevenue, currency, gross - revenue, labels.supplySide);
    addCurrency(this.balances.dailyProtocolRevenue, currency, revenue, RETAINED);
  }

  /** Fee income allocated to HOOKR burns moves from protocol revenue to holders revenue. */
  toHolders(currency: string, amount: bigint, label: string) {
    addCurrency(this.balances.dailyProtocolRevenue, currency, -amount, RETAINED);
    addCurrency(this.balances.dailyHoldersRevenue, currency, amount, label);
  }

  /** A fee taken in the pool's own token and burned: HOOKR burns benefit HOOKR holders, other burns that token's. */
  recordTokenBurn(token: string, amount: bigint) {
    if (lowercase(token) !== CONTRACT.hookr) return this.recordFees('subject', token, amount, 0n);
    this.recordFees('hookrBurn', token, amount, amount);
    this.toHolders(token, amount, HOLDERS.direct);
  }

  /** Window logs (or from `extra.fromBlock`) with emitter, tx hash and position, in on-chain order. */
  async getLogs(targets: string[], eventAbi: string, extra: FetchGetLogsOptions = {}): Promise<HookrLog[]> {
    const fromBlock = extra.fromBlock ?? this.fromBlock;
    if (!targets.length || fromBlock > this.toBlock) return [];
    const logs = await this.options.getLogs({
      targets,
      eventAbi,
      onlyArgs: false,
      toBlock: this.toBlock,
      ...extra,
      fromBlock,
    });
    return logs
      .map((log: any) => {
        const { blockNumber, logIndex } = toPositionedLogArgs(log);
        const transactionHash = lowercase(log.transactionHash ?? log.transaction_hash);
        return { args: log.args, address: lowercase(log.address), transactionHash, blockNumber, logIndex };
      })
      .sort(byPosition);
  }
}
