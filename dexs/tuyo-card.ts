import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const LIQUIDATION_EVENT = "event Liquidation(address indexed _collateralProxy, address[] _assets, uint256[] _amounts)";
const LIQUIDATION_TOPIC = "0x246873b6476f9c2a33e0de31e3a9a0d3d6e9268b413d04928209351193ed31fb";

const topic = (address: string) =>
  "0x000000000000000000000000" + address.slice(2).toLowerCase();

const chainConfig: Record<string, { start: string; rain: string; collateralProxy: string }> = {
  [CHAIN.BASE]: {
    // Paymentscan tracks Tuyo as Base Rain program-issuer settlements; first matched log: 2025-02-01.
    start: "2025-02-01",
    rain: "0x753Fb325Ca30f229E616eA8E6Eb620D0Bb29D0Df",
    collateralProxy: "0xAe1790143248dCF66486fd3B8A9B99aa7691f6f5",
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { rain, collateralProxy } = chainConfig[options.chain];

  const logs = await options.getLogs({
    target: rain,
    eventAbi: LIQUIDATION_EVENT,
    topics: [LIQUIDATION_TOPIC, topic(collateralProxy)],
  });

  logs.forEach((log: any) => {
    log._amounts.forEach((amount: bigint) => {
      dailyVolume.add(ADDRESSES.base.USDC, amount);
    });
  });

  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD value of Tuyo card spends settled through Rain program-issuer settlement contracts.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
