import { ChainApi } from '@defillama/sdk';
import { Interface, ZeroAddress } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { managedVaults, VaultDeployment } from './deployments';

// Canonical V3 position manager on Robinhood; other listed managers are V4 venues.
// https://api.tickerspring.com/v1/public/vaults
const V3_MANAGER = '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3'.toLowerCase();
const EVENTS = {
  collect: 'event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)',
  decrease: 'event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  transfer: 'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  receipt: 'event PositionReceiptCreated(uint256 indexed id, address indexed adapter, bytes32 indexed poolId)',
  recovery: 'event RecoveryOpened(uint8 blocked, uint256 supply, uint256 nominal)',
  proposed: 'event MigrationProposed(uint256 indexed id, bytes32 indexed digest, address position, address router, uint64 proposedAt)',
  executed: 'event MigrationExecuted(bytes32 indexed digest)',
};
const SWAP_FEES = 'Vault Liquidity Fees';
const OPERATIONS = 'Vault Fees To Operations';
const BUYBACK_RESERVE = 'Vault Fees To Buyback Reserve';
const DEPOSITORS = 'Vault Fees To Depositors';

type EventLog = { address: string; blockNumber: number; index?: number; logIndex?: number; transactionHash: string; args: any };
type Inventory = { positions: VaultDeployment[]; receipts: Map<string, VaultDeployment>; recoveries: Map<string, EventLog> };
const lower = (value: string) => value.toLowerCase();
const receiptKey = (manager: string, id: any) => `${lower(manager)}:${id.toString()}`;
const logIndex = (log: EventLog) => {
  const index = log.index ?? log.logIndex;
  if (!Number.isSafeInteger(log.blockNumber) || !Number.isSafeInteger(index))
    throw new Error('TickerSpring: missing log ordering metadata');
  return index!;
};
const compare = (a: EventLog, b: EventLog) => a.blockNumber - b.blockNumber || logIndex(a) - logIndex(b);

async function blockWindow(options: FetchOptions) {
  const fromBlock = await options.getFromBlock(), toBlock = await options.getToBlock();
  if (!Number.isSafeInteger(fromBlock) || fromBlock <= 0 || !Number.isSafeInteger(toBlock) || toBlock <= fromBlock)
    throw new Error('TickerSpring: invalid block window');
  return { fromBlock, toBlock };
}

async function prefetch(options: FetchOptions): Promise<Inventory> {
  const { toBlock } = await blockWindow(options);
  const positions = managedVaults.filter(v => v.deploymentBlock <= toBlock).map(v => ({ ...v }));
  const receipts = new Map<string, VaultDeployment>(), recoveries = new Map<string, EventLog>();
  if (!positions.length) return { positions, receipts, recoveries };
  const history = { fromBlock: Math.min(...positions.map(v => v.deploymentBlock)), toBlock, entireLog: true, parseLog: true };
  const controls = positions.map(v => v.control);
  const executions: EventLog[] = await options.getLogs({ ...history, targets: controls, eventAbi: EVENTS.executed });
  if (executions.length) {
    const proposals: EventLog[] = await options.getLogs({ ...history, targets: controls, eventAbi: EVENTS.proposed });
    const byDigest = new Map(proposals.map(log => [`${lower(log.address)}:${lower(log.args.digest)}`, log]));
    const byControl = new Map(positions.map(v => [lower(v.control), v]));
    const migrated = executions.map(log => {
      const proposal = byDigest.get(`${lower(log.address)}:${lower(log.args.digest)}`);
      if (!proposal || compare(proposal, log) >= 0) throw new Error('TickerSpring: missing migration proposal');
      return { ...byControl.get(lower(log.address))!, position: proposal.args.position };
    });
    // Only immutable metadata of newly discovered contracts is read, at latest.
    // Never pass the runner's historical fromApi/toApi to these calls.
    const latest = new ChainApi({ chain: options.chain });
    const calls = migrated.map(v => ({ target: v.position }));
    const managers = await latest.multiCall({ abi: 'address:manager', calls });
    const owners = await latest.multiCall({ abi: 'address:vault', calls });
    const tokens0 = await latest.multiCall({ abi: 'address:token0', calls });
    const tokens1 = await latest.multiCall({ abi: 'address:token1', calls });
    migrated.forEach((v, i) => {
      if (lower(owners[i]) !== lower(v.vault) || lower(tokens0[i]) !== lower(v.token0) || lower(tokens1[i]) !== lower(v.token1))
        throw new Error('TickerSpring: incompatible migrated position');
      if (!positions.some(p => lower(p.position) === lower(v.position))) positions.push({ ...v, manager: managers[i] });
    });
  }
  const recoveryLogs: EventLog[] = await options.getLogs({ ...history, targets: managedVaults.map(v => v.vault), eventAbi: EVENTS.recovery });
  for (const log of recoveryLogs) {
    const previous = recoveries.get(lower(log.address));
    if (!previous || compare(log, previous) < 0) recoveries.set(lower(log.address), log);
  }
  for (const position of positions) {
    const v3 = lower(position.manager) === V3_MANAGER;
    const eventAbi = v3 ? EVENTS.transfer : EVENTS.receipt;
    // Indexed recipient filters avoid scanning all V3 NFTs. V4 venues are per-position.
    const topics = v3 ? new Interface([eventAbi]).encodeFilterTopics('Transfer', [ZeroAddress, position.position]) as string[] : undefined;
    const logs: EventLog[] = await options.getLogs({
      ...history, fromBlock: position.deploymentBlock, target: position.manager, eventAbi, topics,
    });
    for (const log of logs) {
      if (lower(v3 ? log.args.to : log.args.adapter) !== lower(position.position)) continue;
      const key = receiptKey(position.manager, v3 ? log.args.tokenId : log.args.id);
      if (receipts.has(key)) throw new Error('TickerSpring: duplicate position receipt');
      receipts.set(key, position);
    }
  }
  return { positions, receipts, recoveries };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances(), dailyRevenue = options.createBalances(), dailySupplySideRevenue = options.createBalances();
  const { fromBlock, toBlock } = await blockWindow(options);
  const { positions, receipts, recoveries }: Inventory = options.preFetchedResults ?? await prefetch(options);
  if (positions.length) {
    const window = { fromBlock: fromBlock + 1, toBlock, targets: [...new Set(positions.map(v => lower(v.manager)))], entireLog: true, parseLog: true };
    const collections: EventLog[] = await options.getLogs({ ...window, eventAbi: EVENTS.collect });
    const decreases: EventLog[] = await options.getLogs({ ...window, eventAbi: EVENTS.decrease });
    const events = [...collections.map(log => ({ log, collect: true })), ...decreases.map(log => ({ log, collect: false }))];
    events.forEach(({ log }) => logIndex(log));
    events.sort((a, b) => compare(a.log, b.log));
    const principal = new Map<string, bigint[]>();
    for (const { log, collect } of events) {
      const receipt = receiptKey(log.address, log.args.tokenId);
      const position = receipts.get(receipt);
      if (!position || log.blockNumber < position.deploymentBlock) continue;
      const recovery = recoveries.get(lower(position.vault));
      // Recovery can collect principal days later. Exclude the recovery transaction and
      // all later settlements rather than label those collections as ordinary harvests.
      if (recovery && (lower(log.transactionHash) === lower(recovery.transactionHash) || compare(log, recovery) >= 0)) continue;
      const key = `${receipt}:${lower(log.transactionHash)}`;
      const amounts = [BigInt(log.args.amount0), BigInt(log.args.amount1)];
      if (!collect) {
        const owed = principal.get(key) ?? [0n, 0n];
        principal.set(key, amounts.map((amount, side) => owed[side] + amount));
        continue;
      }
      if (lower(log.args.recipient) !== lower(position.position)) throw new Error('TickerSpring: unexpected collection recipient');
      const owed = principal.get(key);
      if (owed) {
        // The managed position harvests first, then atomically decreases and collects
        // exactly the withdrawn principal. Do not subtract it from the earlier harvest.
        if (amounts.some((amount, side) => amount !== owed[side])) throw new Error('TickerSpring: principal collection mismatch');
        principal.delete(key);
        continue;
      }
      amounts.forEach((gross, side) => {
        const token = side === 0 ? position.token0 : position.token1;
        // Fixed V7 split, floored per harvest as in the vault: https://tickerspring.com/docs
        const operations = gross / 10n, buyback = gross / 5n;
        dailyFees.add(token, gross, SWAP_FEES);
        dailyRevenue.add(token, operations, OPERATIONS);
        dailyRevenue.add(token, buyback, BUYBACK_RESERVE);
        dailySupplySideRevenue.add(token, gross - operations - buyback, DEPOSITORS);
      });
    }
    if (principal.size) throw new Error('TickerSpring: uncollected withdrawal principal');
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const revenueBreakdown = {
  [OPERATIONS]: 'The operations allocation of collected vault LP fees (10%, floored per harvest).',
  [BUYBACK_RESERVE]: 'The allocation reserved for future SPRING buybacks (20%, floored per harvest), not completed buybacks.',
};
const adapter: SimpleAdapter = {
  version: 2, pullHourly: true, doublecounted: true, // LP fees overlap the underlying Uniswap adapters.
  chains: [CHAIN.ROBINHOOD], start: '2026-09-11',
  // The runner passes arbitrary prefetch context through to each hourly fetch.
  prefetch: prefetch as any, fetch,
  methodology: {
    Fees: 'LP fees collected by the listed TickerSpring V7 vaults on the harvest date; excludes uncollected fees, principal, stock-price returns, recovery settlements and lending.',
    Revenue: 'Collected vault LP fees allocated to operations (10%) and the SPRING buyback reserve (20%).',
    ProtocolRevenue: 'Operations and buyback-reserve allocations; reserve funding is not a completed buyback.',
    SupplySideRevenue: 'Collected LP fees retained for vault depositors after the protocol allocations (approximately 70%).',
  },
  breakdownMethodology: {
    Fees: { [SWAP_FEES]: 'V3/V4 position-manager Collect events for vault-owned receipts, excluding principal collections and recovery settlements; reported when harvested, not when earned.' },
    Revenue: revenueBreakdown, ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: { [DEPOSITORS]: 'Collected vault LP fees minus the per-harvest operations and buyback-reserve allocations.' },
  },
};
export default adapter;
