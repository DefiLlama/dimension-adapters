import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// ─── Kaia mainnet addresses ────────────────────────────────────────────────────

/** Wombat single-sided AMM pools (HighCovRatioFeePool style) */
const WOMBAT_POOLS = [
  "0x6389dBfa1427a3b0a89cDdc7eA9BBda6E73dECE7", // Main Pool (Wormhole)
  "0x540cce8Ed7d210f71EEAbb9e7Ed7698AC745e077", // Stable Pool (Wormhole)
  "0x5CDE63386D78362267d9A3edC8DA204bB64D07D3", // LST Pool
  "0x4b63eC6284810f62CecBa6F03CF17413b0f4cEc3", // KRWO Pool
  "0x005A8ED563E802B05E5D59df98f8A6548c14A4d7", // LRT Pool
  "0x1dE1578476d9B4237F963eca5D37500Fc33DF3D1", // Main Pool (Stargate)
  "0x2c0537f3360838B50Ab90cB8cD78beAb8Fc1590C", // Stable Pool (Stargate)
  "0x872E7e7422bcAcdcb37f7FffB0cfe3f2F0D6C546", // Superwalk Pool
];

// ─── Event ABIs

const WOMBAT_SWAP_V2 =
  "event SwapV2(address indexed sender, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, uint256 toTokenFee, address indexed to)";

// ─── Fetch ─────────────────────────────────────────────────────────────────────

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain } = options;
  const dailyVolume            = createBalances();
  const dailyFees              = createBalances();
  const dailyRevenue           = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Wombat single-sided AMM pools
  const wombatLogs = await getLogs({ targets: WOMBAT_POOLS, eventAbi: WOMBAT_SWAP_V2 });
  for (const log of wombatLogs) {
    const { fromToken, toToken, fromAmount, toAmount, toTokenFee } = log;
    addOneToken({ chain, balances: dailyVolume, token0: fromToken, amount0: fromAmount, token1: toToken, amount1: toAmount });
    // toTokenFee is the exact haircut amount denominated in toToken, emitted by the contract
    dailyFees.add(toToken, toTokenFee);
    // All Wombat pool fees go to LPs (supply side) — no protocol revenue
    dailySupplySideRevenue.add(toToken, toTokenFee);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume:            "Notional volume from Wombat single-sided AMM pools (V2 and V3 AMM tracked separately via factory configs)",
  Fees:              "Wombat pools: 4 bps haircut on each swap",
  Revenue:           "No protocol revenue from Wombat pools",
  SupplySideRevenue: "All Wombat pool fees (4 bps) go to liquidity providers",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: "2024-05-15",
    },
  },
};

export default adapter;
