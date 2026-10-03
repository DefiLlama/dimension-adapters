import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// Listed AND retired production markets. Deployment blocks checked against creation receipts.
// Registry: https://github.com/keyuyuan/rh/blob/de11d2c92bf358d9a4f9018941c153167332ef53/config/addresses.json
// Publicly verified v1 source (the other deployments still need public source verification):
// https://sourcify.dev/server/v2/contract/4663/0x118266F880d8A99c8D4F3E507B87c6CabdDF2339?fields=all
const markets = [
  { address: '0x118266F880d8A99c8D4F3E507B87c6CabdDF2339', block: 57076034, legacy: true }, // GME v1, retired
  { address: '0x028727fcf3b76Bcc1a1877100f77a38A73B9eb35', block: 57171859, legacy: true }, // GME v2, retired
  { address: '0x4BC618Fd846602113D494d5f86A0B915257d8d10', block: 57963351, legacy: true }, // SPCX v2, retired
  { address: '0xD233AC577cd0010A7B67EF2d0DA0447FD02375f8', block: 60551889 }, // GME/SGOV, retired
  { address: '0x412a33d1266B5D408191E66b31c372580d9168c8', block: 60557611 }, // GME/SPY, retired
  { address: '0x3D15BB430a70c3dD4ADf329ee7E089885a887e09', block: 60560507 }, // GME/USDG, retired
  { address: '0x4977c00783605750789cEEc5A3cbfaEDA3f015DB', block: 60639274 }, // SPCX
  { address: '0x426A79a122c6A0A47fE2F5c5F41C4BC4d102c414', block: 60685594 }, // NVDA
  { address: '0x0Ac2B1411E4c0623D936DD3E8586eA5EeF1eADB2', block: 60686678 }, // MU
  { address: '0x8e8f3CC988e0D56C52a49F3055aacd62ef1b970c', block: 65660258 }, // GME
  { address: '0x5C88B4f4a1acBBb1E5E63d4414bc194477bD2A7a', block: 66666349 }, // CRCL
  { address: '0x6Ddc8f2dE5DCe2ff2EAc2c12CD96C936948C2912', block: 66674880 }, // USO
];
const PARAMS = 'tuple(uint16 imOpenBps,uint16 imClosedBps,uint16 mmBps,uint16 alphaBps,uint16 baseRateBps,uint16 closedRateBps,uint16 liqBonusBps,uint16 buyInBonusBps,uint16 protocolBps,uint16 maxBuyInSlipBps,uint16 slipGrowthBps,uint16 slipCapBps,uint32 termOpen,uint32 termClosed,uint32 reopenGrace,uint128 borrowCap,uint128 minBorrow)';
const paramsAbi = `function getParams() view returns (${PARAMS})`;
const events = {
  ParamsSet: `event ParamsSet(${PARAMS} p)`,
  Deposit: 'event Deposit(address indexed lender,uint256 amount,uint256 shares)',
  Withdraw: 'event Withdraw(address indexed lender,uint256 amount,uint256 shares)',
  Borrow: 'event Borrow(uint256 indexed id,address indexed borrower,uint256 amount,uint256 collateral,uint256 feeOpen,uint256 premiumBps,uint64 maturity)',
  Repay: 'event Repay(uint256 indexed id,uint256 amount,uint256 timeFee)',
  FlashLoan: 'event FlashLoan(address indexed receiver,address indexed initiator,uint256 amount,uint256 fee)',
  Liquidate: 'event Liquidate(uint256 indexed id,address indexed liquidator,uint256 amount,uint256 seized,uint256 mark)',
  BuyIn: 'event BuyIn(uint256 indexed id,address indexed caller,uint256 amount,uint256 spent,uint256 bonus)',
};
// Exact Borrow/Repay transactions for two confirmed internal acceptance loans.
// Keep their share and parameter events in replay; do not exclude unrelated loans.
const INTERNAL_ACCEPTANCE_TRANSACTIONS = new Set([
  '0xd2a09ae4c40ce2af48999dd3e63ce9358e4891e7524d243127383296f3a804b9',
  '0x607f105e7edbcb1040bf3072695ade7dc458f643f709232ca8e570533576d451',
  '0x4f47f9c4d3d0a52840208713cdd192b1edc5dcf208b5d15463f4b7febb4b4599',
  '0x9615b5384e8865a5e0f7fb664fe6673d27e31dc07ced4a800459b673dcc97268',
]);
type Kind = keyof typeof events;
type Event = { kind: Kind; address: string; block: number; index: number; transactionHash: string; args: any };

export async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const result = () => ({ dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue });
  const previousBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  if (!Number.isSafeInteger(previousBlock) || previousBlock < 0 || !Number.isSafeInteger(toBlock) || toBlock < previousBlock)
    throw new Error('Hegde Borrowing: invalid window blocks');
  const active = markets.filter(m => m.block <= toBlock);
  const fromBlock = Math.max(previousBlock + 1, markets[0].block);
  if (!active.length || fromBlock > toBlock) return result();
  const targets = active.map(m => m.address);
  const logs: Event[] = [];
  // These events omit the collected time fee. Never silently return partial fees
  // when a liquidation/buy-in occurs: trace reconstruction is a merge prerequisite.
  for (const kind of ['Liquidate', 'BuyIn', 'ParamsSet', 'Deposit', 'Withdraw', 'Borrow', 'Repay', 'FlashLoan'] as Kind[]) {
    const rows = await options.getLogs({ targets, eventAbi: events[kind], fromBlock, toBlock, onlyArgs: false });
    if ((kind === 'Liquidate' || kind === 'BuyIn') && rows.length)
      throw new Error(`Hegde Borrowing: ${kind} time-fee reconstruction is not implemented; refusing incomplete totals`);
    for (const row of rows) {
      const block = Number(row.blockNumber), index = Number(row.logIndex ?? row.index);
      if (!row.args || !row.address || !Number.isSafeInteger(block) || !Number.isSafeInteger(index)
        || typeof row.transactionHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(row.transactionHash))
        throw new Error('Hegde Borrowing: missing decoded log or position');
      logs.push({ kind, address: row.address.toLowerCase(), block, index, transactionHash: row.transactionHash.toLowerCase(), args: row.args });
    }
  }
  const existing = active.filter(m => m.block <= previousBlock);
  const openingParams = await options.fromApi.multiCall({ abi: paramsAbi, calls: existing.map(m => ({ target: m.address })) });
  const openingShares = await options.fromApi.multiCall({ abi: 'uint256:totalShares', calls: existing.map(m => ({ target: m.address })) });
  const legacy = active.filter(m => m.legacy);
  const modern = active.filter(m => !m.legacy);
  const legacyCollateral = await options.api.multiCall({ abi: 'address:usdg', calls: legacy.map(m => ({ target: m.address })) });
  const modernCollateral = await options.api.multiCall({ abi: 'address:collateral', calls: modern.map(m => ({ target: m.address })) });
  const collateral = active.map(m => m.legacy ? legacyCollateral[legacy.indexOf(m)] : modernCollateral[modern.indexOf(m)]);
  const stocks = await options.api.multiCall({ abi: 'address:stock', calls: targets.map(target => ({ target })) });
  const closingParams = await options.api.multiCall({ abi: paramsAbi, calls: targets.map(target => ({ target })) });
  const closingShares = await options.api.multiCall({ abi: 'uint256:totalShares', calls: targets.map(target => ({ target })) });
  const state = new Map(active.map((m, i) => {
    const j = existing.findIndex(e => e.address === m.address);
    return [m.address.toLowerCase(), { collateral: collateral[i], stock: stocks[i], shares: j < 0 ? 0n : BigInt(openingShares[j]), protocolBps: j < 0 ? undefined : BigInt(openingParams[j].protocolBps), closingShares: BigInt(closingShares[i]), closingBps: BigInt(closingParams[i].protocolBps) }];
  }));
  for (const event of logs.sort((a, b) => a.block - b.block || a.index - b.index)) {
    const market = state.get(event.address);
    if (!market) throw new Error(`Hegde Borrowing: unknown market ${event.address}`);
    const args = event.args;
    if (event.kind === 'ParamsSet') market.protocolBps = BigInt(args.p.protocolBps);
    else if (event.kind === 'Deposit') market.shares += BigInt(args.shares);
    else if (event.kind === 'Withdraw') market.shares -= BigInt(args.shares);
    else if (event.kind === 'FlashLoan') {
      const fee = BigInt(args.fee);
      // Flash fees increase stock totalAssets, entirely for lenders.
      dailyFees.add(market.stock, fee, 'Flash loan fees');
      dailySupplySideRevenue.add(market.stock, fee, 'Flash loan fees to lenders');
    } else if (event.kind === 'Borrow' || event.kind === 'Repay') {
      if (INTERNAL_ACCEPTANCE_TRANSACTIONS.has(event.transactionHash)) continue;
      if (market.protocolBps === undefined) throw new Error('Hegde Borrowing: missing historical parameters');
      const fee = BigInt(event.kind === 'Borrow' ? args.feeOpen : args.timeFee);
      // Exactly reproduce _distribute, including its no-lenders exception.
      const cut = market.shares === 0n ? fee : fee * market.protocolBps / 10000n;
      const label = event.kind === 'Borrow' ? 'Opening fees' : 'Settled borrow interest';
      dailyFees.add(market.collateral, fee, label);
      dailyRevenue.add(market.collateral, cut, `${label} to protocol`);
      dailySupplySideRevenue.add(market.collateral, fee - cut, `${label} to lenders`);
    }
    if (market.shares < 0n || (market.protocolBps !== undefined && market.protocolBps > 10000n))
      throw new Error('Hegde Borrowing: invalid replay state');
  }
  for (const [address, market] of state)
    if (market.shares !== market.closingShares || market.protocolBps !== market.closingBps)
      throw new Error(`Hegde Borrowing: incomplete share/parameter history for ${address}`);
  return result();
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-07',
  fetch,
  methodology: {
    Fees: 'Excluding confirmed internal acceptance transactions: opening fees and actual interest collected on repayment in each market collateral token, plus flash loan fees in stock tokens. Interest uses settlement dates, not continuous accrual estimates. Liquidation or buy-in events fail the fetch until their omitted time fees can be reconstructed. Write-off principal recovery is excluded.',
    Revenue: 'Opening fees and settled interest allocated to protocolFees using the historical protocolBps at each event; all of a fee goes to protocol when totalShares is zero.',
    ProtocolRevenue: 'All protocol revenue is allocated to the protocol treasury. Later claims are not counted again.',
    SupplySideRevenue: 'Opening fees and settled interest remaining after the protocol cut, plus all flash loan fees, allocated to lenders at fee collection rather than their later claims.',
  },
  breakdownMethodology: {
    Fees: {
      'Opening fees': 'Borrow.feeOpen in market collateral units.',
      'Settled borrow interest': 'Repay.timeFee in market collateral units, recognized on repayment.',
      'Flash loan fees': 'FlashLoan.fee in borrowed stock units.',
    },
    Revenue: {
      'Opening fees to protocol': 'Exact integer protocol allocation at loan opening.',
      'Settled borrow interest to protocol': 'Exact integer protocol allocation at repayment.',
    },
    ProtocolRevenue: {
      'Opening fees to protocol': 'Exact integer protocol allocation at loan opening.',
      'Settled borrow interest to protocol': 'Exact integer protocol allocation at repayment.',
    },
    SupplySideRevenue: {
      'Opening fees to lenders': 'Opening fees less protocol allocation.',
      'Settled borrow interest to lenders': 'Collected interest less protocol allocation.',
      'Flash loan fees to lenders': 'All flash loan fees increase lender stock assets.',
    },
  },
};
export default adapter;
