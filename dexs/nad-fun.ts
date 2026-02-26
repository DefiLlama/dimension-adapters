import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const bondingCurve = "0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE";
const lpManager = "0xAebe5522749b65eaE7b2A35c593145CC3128b515";

const abi = {
  CurveBuy:
    "event CurveBuy(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
  CurveCreate:
    "event CurveCreate(address indexed creator, address indexed token, address indexed pool, string name, string symbol, string tokenURI, uint256 virtualMon, uint256 virtualToken, uint256 targetTokenAmount)",
  CurveGraduate:
    "event CurveGraduate(address indexed token, address indexed pool)",
  CurveSell:
    "event CurveSell(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
  LpManagerCollect:
    "event LpManagerCollect(address indexed token, address indexed pool, uint256 monAmount, uint256 tokenAmount, uint256 lastCollectTime)",
  config:
    "function config() view returns (uint24 communityTreasuryFeeRate, uint24 creatorTreasuryFeeRate, uint24 foundationTreasuryFeeRate)",
};

interface FeeRates {
  communityRate: number;
  creatorRate: number;
  foundationRate: number;
}

function parseFeeConfig(config: {
  communityTreasuryFeeRate: number;
  creatorTreasuryFeeRate: number;
  foundationTreasuryFeeRate: number;
}): FeeRates {
  return {
    communityRate: Number(config.communityTreasuryFeeRate) / 1_000_000,
    creatorRate: Number(config.creatorTreasuryFeeRate) / 1_000_000,
    foundationRate: Number(config.foundationTreasuryFeeRate) / 1_000_000,
  };
}

const metrics = {
  CreationFees: "Creation Fees",
  GraduationFees: "Graduation Fees",
  CommunityFees: "Community Fees from LPs",
  CreatorsFees: "Creators Fees from LPs",
  FoundationFees: "Foundation Fees from LPs",
  BuyFees: "Buy Fees",
  SellFees: "Sell Fees",
};

// https://github.com/Naddotfun/contract-v3-abi
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Read fee config at period's end block (api is bound to toBlock per period)
  const [
    configResult,
    creationLogs,
    buyLogs,
    sellLogs,
    graduateLogs,
    lpManagerCollectLogs,
  ] = await Promise.all([
    options.api.call({ target: lpManager, abi: abi.config }),
    options.getLogs({ target: bondingCurve, eventAbi: abi.CurveCreate }),
    options.getLogs({ target: bondingCurve, eventAbi: abi.CurveBuy }),
    options.getLogs({ target: bondingCurve, eventAbi: abi.CurveSell }),
    options.getLogs({ target: bondingCurve, eventAbi: abi.CurveGraduate }),
    options.getLogs({ target: lpManager, eventAbi: abi.LpManagerCollect }),
  ]);

  const { communityRate, creatorRate, foundationRate } =
    parseFeeConfig(configResult);

  dailyFees.addGasToken(10 * creationLogs.length * 1e18, metrics.CreationFees);
  dailyFees.addGasToken(
    3_000 * graduateLogs.length * 1e18,
    metrics.GraduationFees,
  );
  dailyRevenue.addGasToken(
    10 * creationLogs.length * 1e18,
    metrics.CreationFees,
  );
  dailyRevenue.addGasToken(
    3_000 * graduateLogs.length * 1e18,
    metrics.GraduationFees,
  );

  lpManagerCollectLogs.forEach((log: { monAmount: string | number }) => {
    const collectFee = Number(log.monAmount);

    dailyFees.addGasToken(collectFee * foundationRate, metrics.FoundationFees);
    dailyFees.addGasToken(collectFee * communityRate, metrics.CommunityFees);
    dailyFees.addGasToken(collectFee * creatorRate, metrics.CreatorsFees);

    dailyRevenue.addGasToken(
      collectFee * foundationRate,
      metrics.FoundationFees,
    );

    dailySupplySideRevenue.addGasToken(
      collectFee * communityRate,
      metrics.CommunityFees,
    );
    dailySupplySideRevenue.addGasToken(
      collectFee * creatorRate,
      metrics.CreatorsFees,
    );
  });

  buyLogs.forEach((log) => {
    const fee = (Number(log.amountIn) * 1) / 100; // 1% fee on buys
    dailyFees.addGasToken(fee, metrics.BuyFees);
    dailyRevenue.addGasToken(fee, metrics.BuyFees);
    dailyVolume.addGasToken(Number(log.amountIn));
  });

  sellLogs.forEach((log) => {
    const fee = (Number(log.amountOut) * 1) / 100; // 1% fee on sells
    dailyFees.addGasToken(fee, metrics.SellFees);
    dailyRevenue.addGasToken(fee, metrics.SellFees);
    dailyVolume.addGasToken(log.amountOut);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
    },
  },
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "Protocol fees are generated from Bonding Curve token actions (create, buy, sell, graduate) and from post-graduation LP manager fee collections.",
    Revenue:
      "All fees generated on the Bonding Curve itself (create, buy, sell, graduate) are counted as protocol revenue. For post-graduation LP manager collections, the Foundation share (configured on-chain via LpManager.config()) is treated as protocol revenue.",
    ProtocolRevenue: "All revenue goes to Foundation Treasury.",
    SupplySideRevenue:
      "Community and Creator shares of fees collected by the LP Manager on graduated pools, as configured on-chain via LpManager.config().",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.CreationFees]:
        "10 MON fee charged when a new token is created on the Bonding Curve.",
      [metrics.GraduationFees]:
        "Flat 3,000 MON fee charged when a token graduates from the Bonding Curve to the DEX pool.",
      [metrics.BuyFees]:
        "1% fee charged on the MON input amount for Bonding Curve buy trades.",
      [metrics.SellFees]:
        "1% fee charged on the token output amount for Bonding Curve sell trades.",
      [metrics.FoundationFees]:
        "Foundation share of fees collected by the LP Manager on graduated pools (rate from on-chain config).",
      [metrics.CommunityFees]:
        "Community share of fees collected by the LP Manager on graduated pools (rate from on-chain config).",
      [metrics.CreatorsFees]:
        "Creator share of fees collected by the LP Manager on graduated pools (rate from on-chain config).",
    },
    Revenue: {
      [metrics.CreationFees]:
        "10 MON fee charged when a new token is created on the Bonding Curve.",
      [metrics.GraduationFees]:
        "Flat 3,000 MON fee charged when a token graduates from the Bonding Curve to the DEX pool.",
      [metrics.BuyFees]:
        "1% fee charged on the MON input amount for Bonding Curve buy trades.",
      [metrics.SellFees]:
        "1% fee charged on the token output amount for Bonding Curve sell trades.",
      [metrics.FoundationFees]:
        "Foundation share of fees collected by the LP Manager on graduated pools (rate from on-chain config).",
    },
    SupplySideRevenue: {
      [metrics.CommunityFees]:
        "Community share of fees collected by the LP Manager on graduated pools (rate from on-chain config).",
      [metrics.CreatorsFees]:
        "Creator share of fees collected by the LP Manager on graduated pools (rate from on-chain config).",
    },
  },
};

export default adapter;
