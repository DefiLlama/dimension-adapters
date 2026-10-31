import { ChainApi } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { OVERSEER, windowBounds } from '../../helpers/valantis';

const BPS = 10000n;
export function rebaseAmounts(current: bigint, next: bigint, rate: bigint) {
  const net = next - current;
  if (rate < 0n || rate > BPS || (net > 0n && rate === BPS)) throw new Error('Cannot reconstruct stHYPE gross rewards at this protocol fee');
  const gross = net > 0n ? net * BPS / (BPS - rate) : net;
  return { gross, net, revenue: gross - net };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances(), dailyRevenue = options.createBalances(), dailySupplySideRevenue = options.createBalances();
  const bounds = await windowBounds(options);
  const rebases = await options.getLogs({ target: OVERSEER, eventAbi: 'event Rebase(uint256 currentSupply,uint256 newSupply,uint256 rebaseInterval,int256 indexed apr,uint256 indexed currentShareRate,uint256 indexed timeElapsed)', onlyArgs: false });
  const updates = await options.getLogs({ target: OVERSEER, eventAbi: 'event ProtocolFeeSet(uint256 fee)', onlyArgs: false });
  if (rebases.length) {
    // Read before the first rebase rather than querying a not-yet-deployed
    // Overseer at the beginning of its launch day. Earlier setters are replayed.
    const firstBlock = Math.min(...rebases.map(l => Number(l.blockNumber)));
    const opening = new ChainApi({ chain: options.chain, block: firstBlock - 1 });
    let rate = BigInt(await opening.call({ target: OVERSEER, abi: 'uint256:protocolFee' }));
    const logs = [...rebases.map(l => ({ ...l, kind: 'rebase' })), ...updates.map(l => ({ ...l, kind: 'rate' }))]
      .sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber) || Number(a.logIndex ?? a.index) - Number(b.logIndex ?? b.index));
    for (const log of logs) {
      if (log.kind === 'rate') { rate = BigInt(log.args.fee); continue; }
      if (!bounds.includes(log)) continue;
      const amounts = rebaseAmounts(BigInt(log.args.currentSupply), BigInt(log.args.newSupply), rate);
      dailyFees.addGasToken(amounts.gross.toString(), 'Staking Rewards');
      dailyRevenue.addGasToken(amounts.revenue.toString(), 'Staking Rewards To Valantis');
      dailySupplySideRevenue.addGasToken(amounts.net.toString(), 'Staking Rewards To Stakers');
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  // First Overseer Rebase: block 172466, 2025-02-22T00:19:42Z.
  version: 2, pullHourly: true, chains: [CHAIN.HYPERLIQUID], start: '2025-02-22', fetch,
  allowNegativeValue: true, // Negative rebases represent genuine losses to stHYPE holders.
  methodology: {
    Fees: 'Gross HYPE rewards recognized by Overseer rebases, reconstructed from net rewards and the on-chain protocol fee.',
    Revenue: 'The protocol fee accrued to Valantis on positive stHYPE rebases.',
    ProtocolRevenue: 'The protocol fee accrued to Valantis on positive stHYPE rebases.',
    SupplySideRevenue: 'Net HYPE rewards, or realized rebase losses, passed through to stHYPE holders.',
  },
  breakdownMethodology: {
    Fees: { 'Staking Rewards': 'Gross positive rebase rewards; negative rebases retain their signed loss.' },
    Revenue: { 'Staking Rewards To Valantis': 'Gross rewards less the net rebase distributed to holders.' },
    ProtocolRevenue: { 'Staking Rewards To Valantis': 'Protocol fees retained by Valantis.' },
    SupplySideRevenue: { 'Staking Rewards To Stakers': 'The signed net rebase distributed to holders.' },
  },
};
export default adapter;
