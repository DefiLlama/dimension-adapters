import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

const MAMO_MULTI_REWARDS = "0x7855B0821401Ab078f6Cf457dEAFae775fF6c7A3";
const MAMO_TOKEN = "0x7300B37DfdfAb110d83290A29DfB31B1740219fE";

// Per-asset config hardcoded from mamo-contracts/addresses/8453.json
const CONFIGS = [
  {
    factory: "0x3098360e627E84Fb9dD621F01ea03E325cCEE2c6",
    mToken: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22", // Moonwell mUSDC
    morphoVault: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca", // Moonwell Flagship USDC
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  },
  {
    factory: "0xf8CFdEf5068929e022a50315983043b61E9987f8",
    mToken: "0xF877ACaFA28c19b96727966690b2f44d35aD5976", // Moonwell mcbBTC
    morphoVault: "0x543257eF2161176D7C8cD90BA65C2d4CaEF5a796", // MetaMorpho cbBTC
    token: ADDRESSES.base.cbBTC,
  },
  {
    factory: "0x14bA47Ef0286B345E2B74d26243767268290eE28",
    mToken: "0x628ff693426583D9a7FB391E54366292F509D457", // Moonwell mWETH
    morphoVault: "0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1", // MetaMorpho WETH
    token: ADDRESSES.base.WETH,
  },
];

const STRATEGY_CREATED = "event StrategyCreated(address indexed user, address indexed strategy)";
const FACTORY_DEPLOY_BLOCK = 20_000_000; // Base ~Jul 2025

const fetch = async (options: FetchOptions) => {
  const dailySupplySideRevenue = options.createBalances();

  for (const config of CONFIGS) {
    const logs = await options.getLogs({
      target: config.factory,
      eventAbi: STRATEGY_CREATED,
      fromBlock: FACTORY_DEPLOY_BLOCK,
    });

    // Safely extract strategy addresses — handle both direct and args-wrapped shapes
    const strategies: string[] = logs
      .map((l: any) => l.strategy ?? l.args?.strategy)
      .filter((s: any): s is string => typeof s === "string" && s.startsWith("0x"));

    if (!strategies.length) continue;

    const mTokenBalCalls = strategies.map((s) => ({ target: config.mToken, params: [s] }));
    const morphoShareCalls = strategies.map((s) => ({ target: config.morphoVault, params: [s] }));
    const PRICE_QUERY = "1000000000000000000"; // 1e18 shares

    // All balance/rate calls in parallel, using multiCall for scalar rates too
    const [
      mTokenBals,
      [rateFrom], [rateTo],
      morphoShares,
      [morphoPriceFrom], [morphoPriceTo],
    ] = await Promise.all([
      options.toApi.multiCall({
        abi: "function balanceOf(address) view returns (uint256)",
        calls: mTokenBalCalls,
        permitFailure: true,
      }),
      options.fromApi.multiCall({
        abi: "uint256:exchangeRateStored",
        calls: [config.mToken],
        permitFailure: true,
      }),
      options.toApi.multiCall({
        abi: "uint256:exchangeRateStored",
        calls: [config.mToken],
        permitFailure: true,
      }),
      options.toApi.multiCall({
        abi: "function balanceOf(address) view returns (uint256)",
        calls: morphoShareCalls,
        permitFailure: true,
      }),
      options.fromApi.multiCall({
        abi: "function convertToAssets(uint256) view returns (uint256)",
        calls: [{ target: config.morphoVault, params: [PRICE_QUERY] }],
        permitFailure: true,
      }),
      options.toApi.multiCall({
        abi: "function convertToAssets(uint256) view returns (uint256)",
        calls: [{ target: config.morphoVault, params: [PRICE_QUERY] }],
        permitFailure: true,
      }),
    ]);

    // Moonwell yield: totalMTokenShares × Δ(exchangeRate) / 1e18
    if (rateFrom != null && rateTo != null) {
      const totalMTokenShares = mTokenBals.reduce(
        (sum: number, b: any) => sum + Number(b ?? 0), 0
      );
      const mTokenYield = totalMTokenShares * (Number(rateTo) - Number(rateFrom)) / 1e18;
      if (mTokenYield > 0) dailySupplySideRevenue.add(config.token, mTokenYield);
    }

    // MetaMorpho yield: totalMorphoShares × Δ(pricePerShare) / 1e18
    if (morphoPriceFrom != null && morphoPriceTo != null) {
      const totalMorphoShares = morphoShares.reduce(
        (sum: number, b: any) => sum + Number(b ?? 0), 0
      );
      const morphoYield = totalMorphoShares * (Number(morphoPriceTo) - Number(morphoPriceFrom)) / 1e18;
      if (morphoYield > 0) dailySupplySideRevenue.add(config.token, morphoYield);
    }
  }

  // Aerodrome LP fees distributed to MAMO stakers
  const dailyHoldersRevenue = await addTokensReceived({
    options,
    targets: [MAMO_MULTI_REWARDS],
    tokens: [MAMO_TOKEN, ADDRESSES.base.cbBTC],
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailySupplySideRevenue);
  dailyFees.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-09-01",
    },
  },
  methodology: {
    Fees: "Yield earned by Mamo strategy depositors from Moonwell/MetaMorpho positions plus Aerodrome LP fees distributed to MAMO stakers.",
    SupplySideRevenue: "Interest accrued on user deposits via Moonwell mToken exchange rate growth and MetaMorpho vault share price growth.",
    HoldersRevenue: "Aerodrome LP trading fees distributed to MAMO stakers via the multi-rewards contract.",
  },
};

export default adapter;
