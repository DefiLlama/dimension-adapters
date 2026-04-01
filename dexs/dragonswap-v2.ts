import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.06% of each swap.",
  SupplySideRevenue: "LPs receive 0.24% of the fees.",
  HoldersRevenue: "",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
};

const ABIS = {
  POOL_CREATE: 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
  SWAP_EVENT: 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch: getUniV2LogAdapter({
        factory: '0x224302153096E3ba16c4423d9Ba102D365a94B2B',
        poolCreatedEvent: ABIS.POOL_CREATE,
        swapEvent: ABIS.SWAP_EVENT
      }),
    },
  },
};

export default adapter;
