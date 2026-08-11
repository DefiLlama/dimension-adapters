import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const LIQUIDATION_EVENT = "event Liquidation(address indexed _collateralProxy, address[] _assets, uint256[] _amounts)";
const LIQUIDATION_TOPIC = "0x246873b6476f9c2a33e0de31e3a9a0d3d6e9268b413d04928209351193ed31fb";

const topic = (address: string) =>
  "0x000000000000000000000000" + address.slice(2).toLowerCase();

const chainConfig: Record<string, { start: string; rain: string; collateralProxy: string }> = {
  [CHAIN.POLYGON]: {
    start: "2024-10-03",
    rain: "0x5d5Cef756412045617415FC78D510003238EAfFd",
    collateralProxy: "0x9d983bfF3CB688270e7b85BCFDbEBe69f7952751",
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-06-14",
    rain: "0x753Fb325Ca30f229E616eA8E6Eb620D0Bb29D0Df",
    collateralProxy: "0x98965FBce47dCFD11cA61Ec007c994beE4ed2246",
  },
  [CHAIN.OPTIMISM]: {
    start: "2024-06-14",
    rain: "0x753Fb325Ca30f229E616eA8E6Eb620D0Bb29D0Df",
    collateralProxy: "0x733DDAaB8341AFfEf7d625462cD0A363Cd8A3207",
  },
  [CHAIN.BASE]: {
    start: "2024-06-14",
    rain: "0x753Fb325Ca30f229E616eA8E6Eb620D0Bb29D0Df",
    collateralProxy: "0x37920D57bfD3A67dB111dD692Cdd6857C8a0D32C",
  },
  [CHAIN.ETHEREUM]: {
    start: "2024-06-14",
    rain: "0xE5D3d7da4b24bc9D2FDA0e206680CD8A00C0FeBD",
    collateralProxy: "0x386D3D6216f89B6b22Aab7caA04e65053C7e1966",
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
    log._assets.forEach((asset: string, index: number) => {
      dailyVolume.add(asset, log._amounts[index]);
    });
  });

  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD value of spends settled through Kolo Rain contracts.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
