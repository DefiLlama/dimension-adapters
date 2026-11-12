import { FeeAccounting, toBigInt, lowercase, eventTopic } from './common';
import { CONTRACT } from './config';

/** Count performance-fee skims on realized vault earnings, excluding the LP earnings themselves. */
export async function fetchVaultFees(accounting: FeeAccounting) {
  // Only the vault's performance fee is a Hookr charge; ordinary LP earnings are not added again.
  // https://github.com/Hookr-fun/hookr-contracts/blob/main/hookr-1/src/extensions/HookrLiquidityVault.sol
  const getLogs = await accounting.getLogs(
    [CONTRACT.liquidityVault],
    'event FeesRealized(uint256 indexed id,uint256 fees0,uint256 fees1,uint256 skim0,uint256 skim1)',
  );
  const charged = getLogs.filter(log => toBigInt(log.args.skim0) + toBigInt(log.args.skim1) > 0n);
  if (!charged.length) {
    return;
  }

  const ids = [...new Set(charged.map(log => log.args.id.toString()))];
  const ranges = await accounting.options.toApi.multiCall({
    target: CONTRACT.liquidityVault,
    abi:
      'function range(uint256) view returns((bytes32 poolId,int24 tickLower,int24 tickUpper,' +
      'uint256 feesPerShare0X128,uint256 feesPerShare1X128))',
    calls: ids,
  });
  const pools = [...new Set<string>(ranges.map(range => lowercase(range.poolId)))];
  const eventAbi =
    'event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,' +
    'int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)';
  const initializations = await accounting.getLogs([CONTRACT.poolManager], eventAbi, {
    fromBlock: 1,
    cacheInCloud: true,
    topics: [eventTopic(eventAbi), pools] as any,
  });
  const currencies = new Map(
    initializations.map(log => [lowercase(log.args.id), [log.args.currency0, log.args.currency1]]),
  );
  const byRange = new Map(ids.map((id, index) => [id, currencies.get(lowercase(ranges[index].poolId))]));

  for (const log of charged) {
    const tokens = byRange.get(log.args.id.toString());
    if (!tokens) {
      throw new Error('Hookr: liquidity-vault fee without pool currencies');
    }

    accounting.recordFees('vault', tokens[0], toBigInt(log.args.skim0), toBigInt(log.args.skim0));
    accounting.recordFees('vault', tokens[1], toBigInt(log.args.skim1), toBigInt(log.args.skim1));
  }
}
