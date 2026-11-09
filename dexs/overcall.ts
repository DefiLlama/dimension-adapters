import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";

// Overcall: skill-based markets on Robinhood Chain (Channels, and predictions on other players' channels). Every
// currency has its own vault, the counterparty of every position in it. Volume is the vaults' turnover, as the app's
// dashboard reads it: the deposit of every position opened (DepositCollected) plus the winnings the vault pays out of
// its capital (Settled.fromCapital), less the deposits of positions cancelled or refunded (contracts v3 GameLogic
// _refund: the vault's Settled, then the game's PositionCancelled / PositionRefunded in the same transaction).
// Contracts: ChannelGame 0x1C7dDdc2fA9BEc0549FcdeabcfeBD37452d2CDCb, one Vault per currency.
const GAME = "0x1C7dDdc2fA9BEc0549FcdeabcfeBD37452d2CDCb";
const OVER_VAULT = "0xFB4C6062c24313E2E8Cf01D1CCBa0B940e7b29f6";
const USDG_VAULT = "0x526b07940694f599aA2e9DbDE30540BE004aC80e";
const VAULTS = [OVER_VAULT, USDG_VAULT];
// $OVER is priced by its CoinGecko id: the coins server has no price for its Robinhood Chain address yet
const OVER_CG = "overcall";

const DEPOSIT_COLLECTED = "event DepositCollected(address indexed from, uint256 amount)";
const SETTLED = "event Settled(uint256 depositIn, uint256 fromCapital, address indexed to, uint256 toPlayer, uint256 toRevenue, uint256 indexed royaltyChannelId, uint256 toRoyalty)";
const CANCELLED = "event PositionCancelled(uint256 indexed positionId)";
const REFUNDED = "event PositionRefunded(uint256 indexed positionId, uint256 refund)";

const logIndexOf = (log: any): number => Number(log.logIndex ?? log.index);
const txOf = (log: any): string => String(log.transactionHash).toLowerCase();

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const tokens: string[] = await options.api.multiCall({ abi: "address:token", calls: VAULTS });
  const [deposits, settles, cancelled, refunded] = await Promise.all([
    options.getLogs({ targets: VAULTS, eventAbi: DEPOSIT_COLLECTED, flatten: false }),
    options.getLogs({ targets: VAULTS, eventAbi: SETTLED, entireLog: true, flatten: false }),
    options.getLogs({ target: GAME, eventAbi: CANCELLED, entireLog: true }),
    options.getLogs({ target: GAME, eventAbi: REFUNDED, entireLog: true }),
  ]);
  // the refund's Settled is the last vault Settled before the game's cancel / refund event in its transaction
  const settlesByTx = new Map<string, any[]>();
  settles.flat().forEach((l: any) => settlesByTx.set(txOf(l), [...(settlesByTx.get(txOf(l)) ?? []), l]));
  const voided = new Set<any>();
  [...cancelled, ...refunded].forEach((event: any) => {
    const before = (settlesByTx.get(txOf(event)) ?? []).filter((l) => logIndexOf(l) < logIndexOf(event));
    if (before.length) voided.add(before.reduce((a, b) => (logIndexOf(b) > logIndexOf(a) ? b : a)));
  });
  VAULTS.forEach((vault, i) => {
    const add = (amount: bigint) => {
      if (amount === 0n) return;
      if (vault === OVER_VAULT) dailyVolume.addCGToken(OVER_CG, Number(amount) / 1e18);
      else dailyVolume.add(tokens[i], amount);
    };
    for (const l of deposits[i]) add(BigInt(l.amount));
    for (const l of settles[i]) {
      if (voided.has(l)) add(-BigInt(l.args.depositIn));
      else add(BigInt(l.args.fromCapital));
    }
  });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-20",
  methodology: {
    Volume: "The vaults' turnover in $OVER and USDG: the deposit of every position opened, Channels and predictions, plus the winnings the vaults pay out of their capital, less the deposits of cancelled and refunded positions.",
  },
};

export default adapter;
