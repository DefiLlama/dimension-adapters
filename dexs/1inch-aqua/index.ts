import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Aqua registries (https://github.com/1inch/aqua), each deployed at the same
// address on every supported chain. The protocol redeployed on 2026-07-19 as
// AquaRouter with an unchanged event interface (source verified, e.g.
// https://robinhoodchain.blockscout.com/address/0x1111113CCf1426A8e30e2BFF5e005D929bf6A90A?tab=contract);
// the original developer-release registry is kept so earlier history stays reproducible.
const AQUA_REGISTRIES = [
  "0x499943e74fb0ce105688beee8ef2abec5d936d31", // developer release, 2025-11-17
  "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a", // AquaRouter, 2026-07-19
];

const PUSHED_ABI =
  "event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount)";
const SHIPPED_ABI =
  "event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)";

const logIndexOf = (log: any) => Number(log.logIndex ?? log.index);
const positionOf = (log: any) =>
  `${log.address.toLowerCase()}-${log.transactionHash.toLowerCase()}-${logIndexOf(log)}`;
const strategyOf = (log: any) =>
  `${log.args.maker}-${log.args.app}-${log.args.strategyHash}`.toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Volume is the fee-inclusive side of each swap: the amount a taker pays
  // into the maker wallet, emitted as Pushed by the registry's push().
  // (Pulled, the taker-received side, is net of the maker fee and undercounts.)
  //
  // ship() also emits Pushed events, but those only register a strategy's
  // initial virtual balances - no tokens move - and must not count as volume.
  // entireLog keeps address/transactionHash/logIndex on the logs so they can
  // be separated below; parseLog must be explicit because the indexer path
  // does not auto-enable it the way the RPC path does.
  const [pushedLogs, shippedLogs] = await Promise.all([
    options.getLogs({
      targets: AQUA_REGISTRIES,
      eventAbi: PUSHED_ABI,
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      targets: AQUA_REGISTRIES,
      eventAbi: SHIPPED_ABI,
      entireLog: true,
      parseLog: true,
    }),
  ]);

  const pushedByPosition = new Map<string, any>();
  pushedLogs.forEach((log: any) => pushedByPosition.set(positionOf(log), log));

  // ship() emits Shipped, then one Pushed per token with no external call in
  // between, so its Pushed run occupies strictly consecutive log indices for
  // the same maker/app/strategyHash. A real swap or deposit push() always
  // emits an ERC20 Transfer before its Pushed event, which breaks the run -
  // walking the run therefore separates registration pushes exactly, even
  // when a ship and a swap share one transaction.
  const shipRegistrationPushes = new Set<string>();
  shippedLogs.forEach((shipped: any) => {
    const txPrefix = `${shipped.address.toLowerCase()}-${shipped.transactionHash.toLowerCase()}`;
    for (let index = logIndexOf(shipped) + 1; ; index++) {
      const pushed = pushedByPosition.get(`${txPrefix}-${index}`);
      if (!pushed || strategyOf(pushed) !== strategyOf(shipped)) break;
      shipRegistrationPushes.add(`${txPrefix}-${index}`);
    }
  });

  pushedLogs.forEach((log: any) => {
    if (shipRegistrationPushes.has(positionOf(log))) return;
    dailyVolume.add(log.args.token, log.args.amount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.BASE,
    CHAIN.OPTIMISM,
    CHAIN.POLYGON,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.BSC,
    CHAIN.XDAI,
    CHAIN.LINEA,
    CHAIN.SONIC,
    CHAIN.UNICHAIN,
    CHAIN.ERA,
    [CHAIN.ROBINHOOD, { start: "2026-07-19" }],
  ],
  start: "2025-11-17", // Aqua developer release: https://blog.1inch.com/aqua-developer-release/
  methodology: {
    Volume:
      "Sum of tokens paid into maker wallets during Aqua swap execution, measured as Pushed events on the Aqua registries (the current AquaRouter and the original developer-release registry). Only the taker-paid side of each swap is counted, to avoid double counting and to include the maker fee (the Pulled side is net of fees and would undercount). Pushed events emitted by strategy deployment (the consecutive run following a Shipped event for the same strategy) only register virtual balances without moving tokens and are excluded.",
  },
};

export default adapter;
