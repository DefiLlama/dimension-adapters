import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Production deployments, creation/runtime verified on Sourcify:
// V1 https://sourcify.dev/server/v2/contract/4663/0x58F6Ced8d02cD2567f1458801440Bc4eb67fA961
// V1 https://sourcify.dev/server/v2/contract/4663/0x2A16d0973385952cFBE750D37f803d0958472844
// V2 https://sourcify.dev/server/v2/contract/4663/0xC78b6A83d75C5612a1A7323702B56038254a6459
// V2 https://sourcify.dev/server/v2/contract/4663/0xb5bAbc5609de876D56662d066a0B5f63eF90a8CC
// V2 curve https://sourcify.dev/server/v2/contract/4663/0x1cFF3F946bfe56533635Ab34bF4Ff125Ff65d330
// Mechanism: https://docs.hedgehood.app/hedgefun
type Deployment = { factory: string; hook: string; block: number; curves: boolean };
const DEPLOYMENTS: Deployment[] = [
  // V1: launches open straight into a Uniswap V4 pool behind the hook.
  { factory: '0x58F6Ced8d02cD2567f1458801440Bc4eb67fA961', hook: '0x2A16d0973385952cFBE750D37f803d0958472844', block: 69454565, curves: false }, // 2026-09-22 06:50:54 UTC
  // V2: launches trade on a stock bonding curve, then graduate into a V4 pool behind the V2 hook.
  // The hook predates the factory, whose constructor checks it.
  { factory: '0xC78b6A83d75C5612a1A7323702B56038254a6459', hook: '0xb5bAbc5609de876D56662d066a0B5f63eF90a8CC', block: 81461253, curves: true }, // 2026-10-06 07:39:12 UTC
];
const BPS = 10000n;
const DEFAULTS = 'tuple(uint256 supply,uint24 lpFee,int24 tickSpacing,uint16 minTaxBps,uint16 maxTaxBps,uint16 protocolBps,uint16 maxCreatorBps,uint16 spikeBps,uint32 spikeSeconds,uint16 sweepTipBps,uint16 snipeBps,uint8 snipeSeconds,uint16 bountyBps,uint16 maxSlippageBps,uint16 maxDeviationBps,uint16 maxBuybackImpactBps,uint32 buybackCooldown,uint256 minLotUsdg,uint256 buybackChunkUsdg,uint256 sellChunkUsdg,uint8 launchFeeCurrency,uint256 launchFeeAmount)';
const ABI = {
  taxed: 'event Taxed(bytes32 indexed id,bool indexed selling,bool inToken,uint256 moved,uint256 tax,uint256 rateBps)',
  swept: 'event Swept(bytes32 indexed id,uint256 tokenBurned,uint256 stockToTreasury,uint256 stockToProtocol,uint256 stockToCreator)',
  launched: 'event Launched(uint256 indexed id,string symbol,address token,address treasury,address hook,address stock,address creator)',
  defaultsSet: `event DefaultsSet(${DEFAULTS} d)`,
  curveFees: 'event TradeFeesAccrued(bool indexed buying,uint256 fee,uint256 protocolFee,uint256 creatorFee,uint256 treasuryFee)',
  curveBought: 'event Bought(address indexed caller,address indexed recipient,uint256 stockSpent,uint256 tokensOut,uint256 burned)',
  defaults: `function getDefaults() view returns (${DEFAULTS})`,
  accrued: 'function accrued(bytes32) view returns (uint256 inToken,uint256 inStock)',
  rates: 'function rates(bytes32) view returns (tuple(uint16 taxBps,uint16 spikeBps,uint32 spikeSeconds,uint16 protocolBps,uint16 creatorBps,uint16 sweepTipBps,uint16 snipeBps,uint8 snipeSeconds))',
};

type Event = { kind: 'taxed' | 'swept' | 'launched' | 'defaultsSet' | 'curveFees' | 'curveBought'; args: any; address: string; blockNumber: number; logIndex: number };
type Balances = ReturnType<FetchOptions['createBalances']>;
const byPosition = (a: Event, b: Event) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const previousBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  for (const deployment of DEPLOYMENTS)
    await fetchDeployment(options, deployment, previousBlock, toBlock, dailyFees, dailyRevenue, dailySupplySideRevenue);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

async function fetchDeployment(options: FetchOptions, { factory, hook, block, curves }: Deployment, previousBlock: number, toBlock: number,
  dailyFees: Balances, dailyRevenue: Balances, dailySupplySideRevenue: Balances) {
  // The runner's opening snapshot is the previous window's closing block.
  // Exclude it from logs so adjacent hourly pulls neither repeat fees nor resets.
  const fromBlock = Math.max(previousBlock + 1, block);
  if (fromBlock > toBlock) return;
  const existedBefore = previousBlock >= block;

  async function logs(kind: Event['kind'], target?: string): Promise<Event[]> {
    const rows = await options.getLogs({ target, noTarget: !target, eventAbi: ABI[kind], fromBlock, toBlock, onlyArgs: false });
    return rows.map(row => {
      const blockNumber = Number(row.blockNumber);
      const logIndex = Number(row.logIndex ?? row.index);
      if (!row.args || !row.address || !Number.isSafeInteger(blockNumber) || !Number.isSafeInteger(logIndex))
        throw new Error('Hedge Fun: missing log position or decoded arguments');
      // Preserve ethers Result: spreading args loses its named tuple fields.
      return { kind, args: row.args, address: row.address, blockNumber, logIndex };
    });
  }

  const taxes = await logs('taxed', hook);
  const sweeps = await logs('swept', hook);
  const poolIds = [...new Set([...taxes, ...sweeps].map(e => e.args.id as string))];
  if (poolIds.length) {
    const stocks = await options.api.multiCall({ target: hook, abi: 'function stockOf(bytes32) view returns (address)', calls: poolIds });
    const tokens = await options.api.multiCall({ target: hook, abi: 'function tokenOf(bytes32) view returns (address)', calls: poolIds });
    const rates = await options.api.multiCall({ target: hook, abi: ABI.rates, calls: poolIds });
    const creators = await options.api.multiCall({ target: hook, abi: 'function creatorOf(bytes32) view returns (address)', calls: poolIds });
    const protocols = await options.api.multiCall({ target: hook, abi: 'function protocolOf(bytes32) view returns (address)', calls: poolIds });
    // accrued() returns zero for an as-yet unregistered pool; the hook itself
    // must exist before an opening snapshot can be queried.
    const opening = existedBefore
      ? await options.fromApi.multiCall({ target: hook, abi: ABI.accrued, calls: poolIds })
      : poolIds.map(() => ({ inStock: '0', inToken: '0' }));
    const closing = await options.api.multiCall({ target: hook, abi: ABI.accrued, calls: poolIds });
    const pools = new Map(poolIds.map((id, i) => [id, {
      stock: stocks[i], token: tokens[i], rates: rates[i],
      // The protocol recipient launched this pool itself, so the creator role is also protocol revenue.
      // Roles are read at the window's close: both change only by an owner action, the creator after 14 days.
      ownCreator: same(creators[i], protocols[i]),
      accrued: BigInt(opening[i].inStock), closing: BigInt(closing[i].inStock), accruedToken: BigInt(opening[i].inToken), closingToken: BigInt(closing[i].inToken),
    }]));

    for (const event of [...taxes, ...sweeps].sort(byPosition)) {
      const pool = pools.get(event.args.id)!;
      if (event.kind === 'taxed') {
        // Includes exact-output BUY taxes paid in stock, not just sells.
        const tax = BigInt(event.args.tax);
        if (event.args.inToken) {
          // Raw charged tokens only: never manufacture a stock/USD value from
          // this launch's own pool price. SDK pricing may not cover the token.
          pool.accruedToken += tax;
          dailyFees.add(pool.token, tax, 'Token-denominated swap fees');
          dailySupplySideRevenue.add(pool.token, tax, 'Swap fees to launched-token burns and sweep callers');
          continue;
        }
        const share = (amount: bigint, bps: bigint) => {
          const net = amount - amount * BigInt(pool.rates.sweepTipBps) / BPS;
          return net * bps / BPS;
        };
        // Attribute the exact increment of each eventual allocation,
        // preserving both integer floors across trades and hourly boundaries.
        const increment = (bps: bigint) => share(pool.accrued + tax, bps) - share(pool.accrued, bps);
        const protocol = increment(BigInt(pool.rates.protocolBps));
        const creator = pool.ownCreator ? increment(BigInt(pool.rates.creatorBps)) : 0n;
        pool.accrued += tax;
        dailyFees.add(pool.stock, tax, 'Stock-denominated trading fees');
        dailyRevenue.add(pool.stock, protocol, 'Trading fees to protocol');
        if (creator > 0n) dailyRevenue.add(pool.stock, creator, 'Creator fees on protocol launches');
        dailySupplySideRevenue.add(pool.stock, tax - protocol - creator, 'Trading fees to creators, strategies and sweep callers');
        continue;
      }
      const tokenBurned = BigInt(event.args.tokenBurned);
      if (tokenBurned > 0n) {
        const gross = pool.accruedToken;
        const tip = gross * BigInt(pool.rates.sweepTipBps) / BPS;
        if (gross <= 0n || tokenBurned !== gross - tip
          || BigInt(event.args.stockToProtocol) !== 0n || BigInt(event.args.stockToCreator) !== 0n
          || BigInt(event.args.stockToTreasury) !== 0n)
          throw new Error(`Hedge Fun: inconsistent token sweep for ${event.args.id}`);
        pool.accruedToken = 0n;
        continue; // Burn and tip settle fees already recorded at the swap.
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
    for (const [id, pool] of pools) {
      if (pool.accrued !== pool.closing) throw new Error(`Hedge Fun: incomplete stock-tax history for ${id}`);
      if (pool.accruedToken !== pool.closingToken) throw new Error(`Hedge Fun: incomplete token-tax history for ${id}`);
    }
  }

  if (curves) {
    // Every V2 launch has its own curve; the factory lists them by strategy id.
    // Curve events share their signatures with nothing else here, so query by topic and keep the factory's curves.
    const count = Number(await options.api.call({ target: factory, abi: 'uint256:strategyCount' }));
    const ids = Array.from({ length: count }, (_, i) => i);
    const addresses: string[] = count ? await options.api.multiCall({ target: factory, abi: 'function curves(uint256) view returns (address)', calls: ids }) : [];
    const known = new Set(addresses.map(a => a.toLowerCase()));
    const events = [...await logs('curveFees'), ...await logs('curveBought')].filter(e => known.has(e.address.toLowerCase()));
    const active = [...new Set(events.map(e => e.address.toLowerCase()))];
    if (active.length) {
      const stocks = await options.api.multiCall({ abi: 'address:stock', calls: active });
      const tokens = await options.api.multiCall({ abi: 'address:token', calls: active });
      const creators = await options.api.multiCall({ abi: 'address:creator', calls: active });
      const protocols = await options.api.multiCall({ abi: 'address:protocol', calls: active });
      const curve = new Map(active.map((a, i) => [a, { stock: stocks[i], token: tokens[i], ownCreator: same(creators[i], protocols[i]) }]));
      for (const event of events) {
        const c = curve.get(event.address.toLowerCase())!;
        if (event.kind === 'curveBought') {
          // Opening-window surcharge: launched tokens taken from the buyer's fill and burned.
          const burned = BigInt(event.args.burned);
          if (burned > 0n) {
            dailyFees.add(c.token, burned, 'Curve opening-window burns');
            dailySupplySideRevenue.add(c.token, burned, 'Curve opening-window burns');
          }
          continue;
        }
        const fee = BigInt(event.args.fee);
        const protocol = BigInt(event.args.protocolFee);
        const creator = BigInt(event.args.creatorFee);
        const treasury = BigInt(event.args.treasuryFee);
        // The curve credits each role's claim at the trade; claims are paid out later and add no fees.
        if (protocol + creator + treasury !== fee) throw new Error(`Hedge Fun: inconsistent curve fee split at ${event.address}`);
        dailyFees.add(c.stock, fee, 'Bonding curve trading fees');
        dailyRevenue.add(c.stock, protocol, 'Bonding curve fees to protocol');
        if (c.ownCreator) dailyRevenue.add(c.stock, creator, 'Creator fees on protocol launches');
        dailySupplySideRevenue.add(c.stock, c.ownCreator ? treasury : creator + treasury, 'Bonding curve fees to creators and strategies');
      }
    }
  }

  const launches = await logs('launched', factory);
  if (launches.length) {
    const changes = await logs('defaultsSet', factory);
    let defaults = existedBefore ? await options.fromApi.call({ target: factory, abi: ABI.defaults }) : undefined;
    const usdg = await options.api.call({ target: factory, abi: 'address:usdg' });
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
}

const protocolBreakdown = {
  'Trading fees to protocol': 'Exact increment of the protocol allocation as stock trading fees accrue in V4 pools, using immutable pool rates and contract integer rounding. Sweeps and claims are not counted again.',
  'Bonding curve fees to protocol': 'The protocol share each V2 bonding curve credits at every trade, as emitted by the curve.',
  'Creator fees on protocol launches': 'The creator share of launches whose creator is the protocol recipient itself (the Hedge Fun Safe), on the curve and in the V4 pool. Pool roles are read at the end of each window.',
  'Launch fees to protocol': 'The full launch fee paid to the factory protocol recipient, using the configuration effective at each launch.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-22',
  // Both hooks operate on Uniswap V4. V1 enforces lpFee == 0. V2 pools carry a V4 LP fee
  // earned by a locked liquidity vault that pays it to the strategy and burns the token side;
  // it is counted by Uniswap V4 and is not a Hedge Fun receipt. External V3 routing fees are not either.
  doublecounted: true,
  fetch,
  methodology: {
    Fees: 'All stock- and launched-token-denominated swap charges in V1 and V2 V4 pools, including opening-period charges and caller incentives; all V2 bonding-curve trading fees and opening-window token burns; plus launch fees. Token charges are recorded in raw units and contribute to USD totals only when DefiLlama pricing supports them; missing prices leave USD coverage incomplete. Excludes strategy profits and buybacks, Uniswap LP fees, external routing fees, and Pons/$HEDGE taxes.',
    Revenue: 'The designated protocol share of stock trading fees on the curve and in pools as they accrue, the creator share of launches made by the protocol recipient itself, plus launch fees; excludes royalties of other creators and launched-token strategy allocations.',
    ProtocolRevenue: 'The same protocol allocations as Revenue, including earned but unswept or unclaimed amounts.',
    SupplySideRevenue: 'Stock trading fees less the protocol allocations go to creators, strategies and sweep callers; all launched-token charges go to token burns and sweep callers, with no platform revenue. Token amounts require DefiLlama price coverage for USD inclusion.',
  },
  breakdownMethodology: {
    Fees: {
      'Stock-denominated trading fees': 'Stock-denominated hook fees from Taxed events in V1 and V2 pools, including sells and stock-paid buys; no fee-on-transfer taxes or underlying Uniswap LP fees.',
      'Token-denominated swap fees': 'Actual token charges emitted by the hook at each swap, including elevated opening rates. Recorded in the launched token without self-pool price conversion; unpriced amounts are not a zero-fee assertion.',
      'Bonding curve trading fees': 'The stock fee each V2 bonding curve charges on buys and sells before graduation, from TradeFeesAccrued events.',
      'Curve opening-window burns': 'Launched tokens burned from bonding-curve buys during the opening window, above the flat stock fee. Recorded in the launched token; unpriced amounts are not a zero-fee assertion.',
      'Launch fees': 'Fees paid for successful launches, with same-block DefaultsSet changes replayed in log order. Includes native, USDG and stock payments; None charges nothing.',
    },
    Revenue: protocolBreakdown,
    ProtocolRevenue: protocolBreakdown,
    SupplySideRevenue: {
      'Swap fees to launched-token burns and sweep callers': 'All token-denominated swap charges accrue to launched-token burns and caller incentives. Neither is revenue of Hedge Fun or its own token holders; subsequent sweeps do not add fees.',
      'Trading fees to creators, strategies and sweep callers': 'Pool stock fees less the protocol allocations. Includes royalties of other creators, launched-token strategy funding and sweep incentives, combined to preserve exact rounding across trades.',
      'Bonding curve fees to creators and strategies': 'Curve stock fees credited to other creators and to each launch\'s strategy treasury.',
      'Curve opening-window burns': 'Opening-window token charges are burned; nobody receives them.',
    },
  },
};

export default adapter;
