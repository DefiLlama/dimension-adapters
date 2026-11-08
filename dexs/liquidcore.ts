import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const SwapEvent = "event Swap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 reserve0, uint256 reserve1)";
const SwapWithRefEvent = "event SwapWithRef(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, bytes32 indexed refCode, uint256 refFee, uint256 reserve0, uint256 reserve1)";

// On 2026-11-08 (~01:56-02:08 UTC) the team upgraded the router and every pool on both chains to a sealed
// recovery implementation (recoveryReceiver()/seal(), proxy admin handed to 0x6303376d2e4f05e3245a2e0de0ae0faf58cdb143).
// That implementation has no getPools() or swap logic, so the pool lists below are the routers' getPools()
// output read at the block before the upgrade (zero-address entry dropped):
// HyperEVM router 0x625aC1D165c776121A52ff158e76e3544B4a0b8B at block 50677009 (upgrade tx 0x978ded3d05510f8d91060a8f6c289e5d19d8c9e0e82de15ecf1e59039dbe372a)
// Robinhood router 0x322F277BfB7Ba9c196194ad18011377A0fF55Fb3 at block 108868678 (upgrade tx 0x06e0ca641fb350a58c1fb7810c979c347ae6284a528f5ad93b0767c6b417c69e)
const chainConfig: Record<string, { start: string, pools: string[] }> = {
  [CHAIN.HYPERLIQUID]: {
    start: "2025-08-11",
    pools: [
      "0xD3994A6CF46cA91536376f89aCDadf92eD289a9F",
      "0xA7478A5ff7cB27A8008D6D90785db10223bc6087",
      "0x56A0f8434dD68F07ACfED07D7d0bB3aD6FE8D677",
      "0x8d7928faFfC2DdDc2af41BD56236b32bB21BE3B5",
      "0xe050C5033dCC344491128dF2609ECC43875DDd9d",
      "0x5600345C1f6232a385d6e24272fd3099641Bace4",
      "0x158F5919A3C65C201A02CB2fEE7421F7B78F3b1e",
      "0x43Bad06C9ad4D0ABffdFf5aaCc534A7644F7872C",
      "0x437BCCDb2875AAce0F685FC7e730B0A758346E5E",
      "0xf19C2837a74b3c555fEF7936E4F769a085570418",
      "0x979041f3D7d0dCaCa6505FA118F7ff4c99760820",
      "0x42FCF7839d2e54148fdedED5a886D467Aa0729f4",
      "0x875971111B19097c555243939CB4D2eEF92c88F6",
      "0x3818F07666A920E9503929818c53396f92A1256c",
      "0xfB5B200657D205F7D57C580A1580a13eD85Ab32a",
      "0xc9C5a2ffE195F070682a2CDDd7d410605494e37B",
      "0x49f13724b5D5cb3A802E5fFe08E8046ED00C61F1",
      "0xF9924cF060f15f1dDe1999CEa3e401A5C462F182",
      "0xb59fa73B82f591140eB459873e7760E4Ebde8793",
      "0x70496C7d251BF31eAbE847dfe23e2BB534C9606b",
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-14",
    pools: ["0x31114060CB522097F4cf670B3CD95c254920668e"],
  },
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { pools } = chainConfig[options.chain];

  const [swapLogs, swapWithRefLogs] = await Promise.all([
    options.getLogs({ targets: pools, eventAbi: SwapEvent, flatten: true }),
    options.getLogs({ targets: pools, eventAbi: SwapWithRefEvent, flatten: true }),
  ]);

  for (const log of swapLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
    dailyRevenue.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
  }

  for (const log of swapWithRefLogs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
    dailyFees.add(log.tokenOut, log.refFee, "Referral Fees");
    dailyRevenue.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(log.tokenOut, log.refFee, "Referral Fees");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const methodology = {
  Volume: "Volume is calculated from the amountIn of all Swap and SwapWithRef events on LiquidCore pools.",
  Fees: "All swap fees collected by LiquidCore pools.",
  Revenue: "Swap fees that go to protocol revenue (100% protocol-owned liquidity).",
  ProtocolRevenue: "Swap fees that go to protocol revenue (100% protocol-owned liquidity).",
  SupplySideRevenue: "Referral fees paid to third-party referrers."
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // router and all pools on both chains moved to a sealed recovery implementation on 2026-11-08 ~02:00 UTC; no swaps possible after that
  deadFrom: "2026-11-08",
  methodology,
  fetch,
  adapter: chainConfig,
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees collected by LiquidCore pools.",
      "Referral Fees": "Referral fees paid to third-party referrers."
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "Swap fees that go to protocol revenue (100% protocol-owned liquidity)."
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "Swap fees that go to protocol revenue (100% protocol-owned liquidity)."
    },
    SupplySideRevenue: {
      "Referral Fees": "Referral fees paid to third-party referrers."
    },
  }
};

export default adapter;
