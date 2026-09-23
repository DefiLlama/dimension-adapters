import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Production deployments, both creation/runtime verified on Sourcify:
// https://sourcify.dev/server/v2/contract/4663/0x58F6Ced8d02cD2567f1458801440Bc4eb67fA961
// https://sourcify.dev/server/v2/contract/4663/0x2A16d0973385952cFBE750D37f803d0958472844
// Mechanism: https://docs.hedgehood.app/hedgefun
const FACTORY = '0x58F6Ced8d02cD2567f1458801440Bc4eb67fA961';
const HOOK = '0x2A16d0973385952cFBE750D37f803d0958472844';
const DEPLOYMENT_BLOCK = 69454565; // 2026-09-22 06:50:54 UTC
const BPS = 10000n;
const DEFAULTS = 'tuple(uint256 supply,uint24 lpFee,int24 tickSpacing,uint16 minTaxBps,uint16 maxTaxBps,uint16 protocolBps,uint16 maxCreatorBps,uint16 spikeBps,uint32 spikeSeconds,uint16 sweepTipBps,uint16 snipeBps,uint8 snipeSeconds,uint16 bountyBps,uint16 maxSlippageBps,uint16 maxDeviationBps,uint16 maxBuybackImpactBps,uint32 buybackCooldown,uint256 minLotUsdg,uint256 buybackChunkUsdg,uint256 sellChunkUsdg,uint8 launchFeeCurrency,uint256 launchFeeAmount)';
const ABI = {
  taxed: 'event Taxed(bytes32 indexed id,bool indexed selling,bool inToken,uint256 moved,uint256 tax,uint256 rateBps)',
  swept: 'event Swept(bytes32 indexed id,uint256 tokenBurned,uint256 stockToTreasury,uint256 stockToProtocol,uint256 stockToCreator)',
  launched: 'event Launched(uint256 indexed id,string symbol,address token,address treasury,address hook,address stock,address creator)',
  defaultsSet: `event DefaultsSet(${DEFAULTS} d)`,
  defaults: `function getDefaults() view returns (${DEFAULTS})`,
  accrued: 'function accrued(bytes32) view returns (uint256 inToken,uint256 inStock)',
  rates: 'function rates(bytes32) view returns (tuple(uint16 taxBps,uint16 spikeBps,uint32 spikeSeconds,uint16 protocolBps,uint16 creatorBps,uint16 sweepTipBps,uint16 snipeBps,uint8 snipeSeconds))',
};

type Event = { kind: 'taxed' | 'swept' | 'launched' | 'defaultsSet'; args: any; blockNumber: number; logIndex: number };
const byPosition = (a: Event, b: Event) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

export async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const result = () => ({ dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue });
  const previousBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  // The runner's opening snapshot is the previous window's closing block.
  // Exclude it from logs so adjacent hourly pulls neither repeat fees nor resets.
  const fromBlock = Math.max(previousBlock + 1, DEPLOYMENT_BLOCK);
  if (fromBlock > toBlock) return result();

  async function logs(kind: Event['kind'], target: string): Promise<Event[]> {
    const rows = await options.getLogs({ target, eventAbi: ABI[kind], fromBlock, toBlock, onlyArgs: false });
    return rows.map(row => {
      const blockNumber = Number(row.blockNumber);
      const logIndex = Number(row.logIndex ?? row.index);
      if (!row.args || !Number.isSafeInteger(blockNumber) || !Number.isSafeInteger(logIndex))
        throw new Error('Hedge Fun: missing log position or decoded arguments');
      // Preserve ethers Result: spreading args loses its named tuple fields.
      return { kind, args: row.args, blockNumber, logIndex };
    });
  }

  const taxes = (await logs('taxed', HOOK)).filter(e => !e.args.inToken);
  const sweeps = (await logs('swept', HOOK)).filter(e => BigInt(e.args.tokenBurned) === 0n);
  const poolIds = [...new Set([...taxes, ...sweeps].map(e => e.args.id as string))];
  if (poolIds.length) {
    const stocks = await options.api.multiCall({ target: HOOK, abi: 'function stockOf(bytes32) view returns (address)', calls: poolIds });
    const rates = await options.api.multiCall({ target: HOOK, abi: ABI.rates, calls: poolIds });
    // accrued() returns zero for an as-yet unregistered pool; the hook itself
    // must exist before an opening snapshot can be queried.
    const opening = previousBlock >= DEPLOYMENT_BLOCK
      ? await options.fromApi.multiCall({ target: HOOK, abi: ABI.accrued, calls: poolIds })
      : poolIds.map(() => ({ inStock: '0' }));
    const closing = await options.api.multiCall({ target: HOOK, abi: ABI.accrued, calls: poolIds });
    const pools = new Map(poolIds.map((id, i) => [id, { stock: stocks[i], rates: rates[i], accrued: BigInt(opening[i].inStock), closing: BigInt(closing[i].inStock) }]));

    for (const event of [...taxes, ...sweeps].sort(byPosition)) {
      const pool = pools.get(event.args.id)!;
      if (event.kind === 'taxed') {
        // Includes exact-output BUY taxes paid in stock, not just sells.
        const tax = BigInt(event.args.tax);
        const protocolCut = (amount: bigint) => {
          const net = amount - amount * BigInt(pool.rates.sweepTipBps) / BPS;
          return net * BigInt(pool.rates.protocolBps) / BPS;
        };
        // Attribute the exact increment of the eventual protocol allocation,
        // preserving both integer floors across trades and hourly boundaries.
        const protocol = protocolCut(pool.accrued + tax) - protocolCut(pool.accrued);
        pool.accrued += tax;
        dailyFees.add(pool.stock, tax, 'Stock-denominated trading fees');
        dailyRevenue.add(pool.stock, protocol, 'Trading fees to protocol');
        dailySupplySideRevenue.add(pool.stock, tax - protocol, 'Trading fees to creators, strategies and sweep callers');
        continue;
      }
      const gross = pool.accrued;
      const tip = gross * BigInt(pool.rates.sweepTipBps) / BPS;
      const protocol = BigInt(event.args.stockToProtocol);
      const creator = BigInt(event.args.stockToCreator);
      const treasury = BigInt(event.args.stockToTreasury);
      // Swept omits the tip. Never invert a rounded net amount to guess gross.
      if (gross <= 0n || treasury + protocol + creator !== gross - tip
        || protocol !== (gross - tip) * BigInt(pool.rates.protocolBps) / BPS
        || creator !== (gross - tip) * BigInt(pool.rates.creatorBps) / BPS)
        throw new Error(`Hedge Fun: inconsistent stock sweep for ${event.args.id}`);
      pool.accrued = 0n;
      // Allocation, payment and later claims do not generate new fees.
      // Failed caller payments become strategy credits; both are supply side.
    }
    for (const [id, pool] of pools)
      if (pool.accrued !== pool.closing) throw new Error(`Hedge Fun: incomplete stock-tax history for ${id}`);
  }

  const launches = await logs('launched', FACTORY);
  if (launches.length) {
    const changes = await logs('defaultsSet', FACTORY);
    let defaults = previousBlock >= DEPLOYMENT_BLOCK ? await options.fromApi.call({ target: FACTORY, abi: ABI.defaults }) : undefined;
    const usdg = await options.api.call({ target: FACTORY, abi: 'address:usdg' });
    for (const event of [...changes, ...launches].sort(byPosition)) {
      if (event.kind === 'defaultsSet') { defaults = event.args.d; continue; }
      if (!defaults) throw new Error('Hedge Fun: missing historical launch-fee configuration');
      const currency = Number(defaults.launchFeeCurrency);
      const amount = BigInt(defaults.launchFeeAmount);
      // Verified Factory FeeCurrency enum: None, Native, Usdg, Stock.
      if (currency === 0 || amount === 0n) continue;
      if (currency === 1) {
        dailyFees.addGasToken(amount, 'Launch fees');
        dailyRevenue.addGasToken(amount, 'Launch fees to protocol');
      } else if (currency === 2 || currency === 3) {
        const token = currency === 2 ? usdg : event.args.stock;
        dailyFees.add(token, amount, 'Launch fees');
        dailyRevenue.add(token, amount, 'Launch fees to protocol');
      } else throw new Error(`Hedge Fun: unknown launch-fee currency ${currency}`);
    }
  }
  return result();
}

const protocolBreakdown = {
  'Trading fees to protocol': 'Exact increment of the protocol allocation as stock trading fees accrue, using immutable pool rates and contract integer rounding. Sweeps and claims are not counted again.',
  'Launch fees to protocol': 'The full launch fee paid to the factory protocol recipient, using the configuration effective at each launch.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-22',
  // Hook operates on Uniswap V4; underlying pool trading fees are excluded.
  doublecounted: true,
  fetch,
  methodology: {
    Fees: 'Stock-denominated hook trading fees when charged, including caller incentives, plus launch fees at issuance. Excludes launched-token-denominated burn taxes without reliable historical prices, strategy profits and buybacks, underlying Uniswap fees, and Pons/$HEDGE taxes.',
    Revenue: 'The designated protocol share of stock trading fees as they accrue, plus launch fees; excludes creator royalties and launched-token strategy allocations.',
    ProtocolRevenue: 'The same designated protocol allocations as Revenue, including earned but unswept or unclaimed amounts.',
    SupplySideRevenue: 'Stock trading fees less the designated protocol share, allocated to creators, launched-token strategies and sweep callers. Failed caller payments are redirected to strategy credits.',
  },
  breakdownMethodology: {
    Fees: {
      'Stock-denominated trading fees': 'Stock-denominated hook fees from Taxed events, including sells and stock-paid exact-output buys; no fee-on-transfer taxes or underlying Uniswap LP fees.',
      'Launch fees': 'Fees paid for successful launches, with same-block DefaultsSet changes replayed in log order. Includes native, USDG and stock payments; None charges nothing.',
    },
    Revenue: protocolBreakdown,
    ProtocolRevenue: protocolBreakdown,
    SupplySideRevenue: {
      'Trading fees to creators, strategies and sweep callers': 'Stock fees less the designated protocol allocation, classified by contract role (including protocol-controlled creators). Includes creator royalties, launched-token strategy funding and sweep incentives, combined to preserve exact rounding across trades.',
    },
  },
};

export default adapter;
