import { FetchOptions } from "../adapters/types";

export const AQUA_PUSHED_ABI =
  "event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount)";
export const AQUA_PULLED_ABI =
  "event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount)";
export const AQUA_SHIPPED_ABI =
  "event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)";

export type AquaFill = {
  token: string;
  strategyHash: string;
  amount: bigint;
  // amount after netting the maker's own strategies traded against each other
  // in the same transaction
  netAmount: bigint;
};

const logIndexOf = (log: any) => Number(log.logIndex ?? log.index);
const txOf = (log: any) =>
  `${log.address.toLowerCase()}-${log.transactionHash.toLowerCase()}`;
const positionOf = (log: any) => `${txOf(log)}-${logIndexOf(log)}`;
const strategyOf = (log: any) =>
  `${log.args.maker}-${log.args.app}-${log.args.strategyHash}`.toLowerCase();
const groupOf = (log: any) =>
  `${txOf(log)}-${log.args.maker}-${log.args.token}`.toLowerCase();
const legOf = (log: any) =>
  `${groupOf(log)}-${log.args.strategyHash}`.toLowerCase();

export async function getAquaFills(
  options: FetchOptions,
  targets: string[],
): Promise<AquaFill[]> {
  const getLogs = (eventAbi: string) =>
    options.getLogs({ targets, eventAbi, entireLog: true, parseLog: true });
  const [pushedLogs, pulledLogs, shippedLogs] = await Promise.all([
    getLogs(AQUA_PUSHED_ABI),
    getLogs(AQUA_PULLED_ABI),
    getLogs(AQUA_SHIPPED_ABI),
  ]);

  const pushedByPosition = new Map<string, any>();
  pushedLogs.forEach((log: any) => pushedByPosition.set(positionOf(log), log));
  const shipRegistrationPushes = new Set<string>();
  shippedLogs.forEach((shipped: any) => {
    for (let index = logIndexOf(shipped) + 1; ; index++) {
      const position = `${txOf(shipped)}-${index}`;
      const pushed = pushedByPosition.get(position);
      if (!pushed || strategyOf(pushed) !== strategyOf(shipped)) break;
      shipRegistrationPushes.add(position);
    }
  });
  const fills = pushedLogs.filter(
    (log: any) => !shipRegistrationPushes.has(positionOf(log)),
  );

  // A maker can run several strategies on the same pair from one wallet. When
  // a transaction buys a token from one of them and sells it back into another,
  // the maker receives and pays out the same token in that transaction and its
  // wallet is left roughly unchanged. Net each maker's pushes of a token
  // against what its other strategies paid out of that token in the same
  // transaction. A strategy's own pull of the token it was paid in is the DAO
  // fee transfer (taken from the input token), not a payout, and is not
  // netted. An ordinary swap or a route through several makers is unaffected.
  const pushedByGroup = new Map<string, bigint>();
  const pushedLegs = new Set<string>();
  const addTo = (map: Map<string, bigint>, group: string, amount: any) =>
    map.set(group, (map.get(group) ?? 0n) + BigInt(amount));
  fills.forEach((log: any) => {
    addTo(pushedByGroup, groupOf(log), log.args.amount);
    pushedLegs.add(legOf(log));
  });
  const paidOutByGroup = new Map<string, bigint>();
  pulledLogs.forEach((log: any) => {
    const group = groupOf(log);
    if (!pushedByGroup.has(group) || pushedLegs.has(legOf(log))) return;
    addTo(paidOutByGroup, group, log.args.amount);
  });

  return fills.map((log: any) => {
    const amount = BigInt(log.args.amount);
    const pushed = pushedByGroup.get(groupOf(log))!;
    const paidOut = paidOutByGroup.get(groupOf(log)) ?? 0n;
    const net = pushed > paidOut ? pushed - paidOut : 0n;
    return {
      token: log.args.token,
      strategyHash: String(log.args.strategyHash).toLowerCase(),
      amount,
      netAmount: pushed === 0n ? 0n : (amount * net) / pushed,
    };
  });
}
