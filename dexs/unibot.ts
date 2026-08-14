import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const chainConfig: Record<string, { start: string; router: string; weth: string }> = {
  [CHAIN.ETHEREUM]: {
    start: "2024-01-11",
    router: "0x5c9321e92Ba4eb43f2901c4952358e132163a85A",
    weth: ADDRESSES.ethereum.WETH,
  },
};

const depositEvent = "event Deposit(address indexed dst, uint256 wad)";
const withdrawalEvent = "event Withdrawal(address indexed src, uint256 wad)";

const fetchEvm = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { router, weth } = chainConfig[options.chain];
  const routerAddress = router.toLowerCase();

  // Unibot performs all transactions via WETH, so we just count deposit/withdrawal of weth
  // Skips dune query via WETH logs
  const [deposits, withdrawals] = await Promise.all([
    options.getLogs({
      target: weth,
      eventAbi: depositEvent,
    }),
    options.getLogs({
      target: weth,
      eventAbi: withdrawalEvent,
    }),
  ]);

  deposits
    .filter((log: any) => log.dst.toLowerCase() === routerAddress)
    .forEach((log: any) => dailyVolume.add(weth, log.wad));

  withdrawals
    .filter((log: any) => log.src.toLowerCase() === routerAddress)
    .forEach((log: any) => dailyVolume.add(weth, log.wad));

  return { dailyVolume };
};

const fetch = (options: FetchOptions) => fetchEvm(options);

const methodology = {
  Volume:
    "Unibot swap volume routed through unibot router.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true,
  methodology,
};

export default adapter;
