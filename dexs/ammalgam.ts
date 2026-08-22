import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { filterPools } from "../helpers/uniswap";

const FACTORY = "0x1a411b0fd1f368d2f413a8cbb6aad425c923015b";
const FACTORY_FROM_BLOCK = 25450093; // First Ethereum mainnet Ammalgam PairCreated block.
const SWAP_VOLUME = "Swap Volume";

const PAIR_CREATED_EVENT =
  "event PairCreated(address indexed tokenX, address indexed tokenY, address pair, uint256 allPairsLength)";
const SWAP_EVENT =
  "event Swap(address indexed sender, uint256 amountXIn, uint256 amountYIn, uint256 amountXOut, uint256 amountYOut, address indexed to)";

interface AmmalgamSwapLog {
  amountXIn: bigint | string | number;
  amountYIn: bigint | string | number;
  amountXOut?: bigint | string | number;
  amountYOut?: bigint | string | number;
}

interface BalanceAdder {
  add: (token: string, amount: bigint | string | number, label?: string) => void;
}

const isPositiveAmount = (amount: bigint | string | number) => BigInt(amount.toString()) > 0n;

export const addAmmalgamSwapVolume = ({
  dailyVolume,
  tokenX,
  tokenY,
  log,
}: {
  dailyVolume: BalanceAdder;
  tokenX: string;
  tokenY: string;
  log: AmmalgamSwapLog;
}) => {
  if (isPositiveAmount(log.amountXIn)) dailyVolume.add(tokenX, log.amountXIn, SWAP_VOLUME);
  if (isPositiveAmount(log.amountYIn)) dailyVolume.add(tokenY, log.amountYIn, SWAP_VOLUME);
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  const pairCreatedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: PAIR_CREATED_EVENT,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });

  const pairObject: Record<string, string[]> = {};
  pairCreatedLogs.forEach((log: any) => {
    pairObject[log.pair] = [log.tokenX, log.tokenY];
  });

  const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances });
  const pairIds = Object.keys(filteredPairs);
  if (!pairIds.length) return { dailyVolume };

  const swapLogs = await options.getLogs({
    targets: pairIds,
    eventAbi: SWAP_EVENT,
    flatten: false,
  });

  swapLogs.forEach((logs: any[], index: number) => {
    const [tokenX, tokenY] = pairObject[pairIds[index]];
    logs.forEach((log) => addAmmalgamSwapVolume({ dailyVolume, tokenX, tokenY, log }));
  });

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Swap volume from Ammalgam pairs deployed by the Ethereum mainnet factory. Volume is counted from the input side of each Swap event only: amountXIn for tokenX and amountYIn for tokenY. Fee metrics are not reported because Ammalgam swap fees are dynamic and are not emitted in the Swap event.",
};

const breakdownMethodology = {
  Volume: {
    [SWAP_VOLUME]: "Input-side token amounts from Ammalgam Swap events.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-07-03",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
