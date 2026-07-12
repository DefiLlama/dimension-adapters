import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const VAULT = "0x8B0665a66d4E046dd5E77a42856F8180F9bb19ef";
const ELUSD = "0x65Fb0f9b196d524De0C4F3BAF572F0a79eb21194";
const STAKING = "0xda34688c14ae164E75D902A962e6C45cD9564448";
const TOKEN_REGISTRY = "0xB25a9d4eAAF0D257f8C1e6F567C357639394dba1";
const PRICE_ORACLE = "0x0A3DA6265439b4585c942856d7Ee22B7b2C973F2";

const ABI = {
  redeemed: "event Redeemed(address indexed redeemer, address indexed recipient, address indexed token, uint256 elUSDAmountIn, uint256 tokenAmountOut)",
  redemptionFee: "uint256:redemptionFee",
  redemptionFeeUpdated: "event RedemptionFeeUpdated(uint256 oldFee, uint256 newFee)",
  managementFeePercent: "uint256:managementFeePercent",
  managementFeeUpdated: "event ManagementFeeUpdated(uint256 oldFeePercent, uint256 newFeePercent)",
  managementFeeAccrued: "event ManagementFeeAccrued(uint256 elapsed, uint256 grossNavUsd)",
  feesCollected: "event FeesCollected(uint256 managementFeeAmount, uint256 performanceFeeAmount)",
  getPrice: "function getPrice(address token) view returns (uint256 price)",
  getTokenConfig: "function getTokenConfig(address token) view returns ((uint8 decimals, bool isMintEnabled, bool isRedeemEnabled, uint16 maxDepegBps) config)",
  transfer: "event Transfer(address indexed from, address indexed to, uint256 amount)",
};

const REDEEM_FEE_LABEL = "Redeem Fees To Treasury";
const MANAGEMENT_FEE_LABEL = "Management Fees To Treasury";
const PERFORMANCE_FEE_LABEL = "Performance Fees To Treasury";
const STAKER_YIELD_LABEL = "Yield To elUSD Stakers";
const BPS_DENOMINATOR = 10_000n;
const YEAR_IN_SECONDS = 365n * 24n * 60n * 60n;
const USD_PRECISION = 1e18;
const ONE_DOLLAR = 10n ** 18n;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";

const toBigInt = (value: bigint | number | string) => BigInt(value.toString());

const topicAddress = (address: string) => `0x000000000000000000000000${address.toLowerCase().slice(2)}`;

const sortByLogPosition = <T extends { blockNumber?: number; logIndex?: number }>(a: T, b: T) =>
  Number(a.blockNumber ?? 0) - Number(b.blockNumber ?? 0) || Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);

const addUsd = (balances: ReturnType<FetchOptions["createBalances"]>, amount: bigint, label: string) => {
  if (amount > 0n) balances.addUSDValue(Number(amount) / USD_PRECISION, label);
};

const deriveRedeemFee = (netTokenAmount: bigint, feeBps: bigint) => {
  if (feeBps === 0n) return 0n;
  return (netTokenAmount * feeBps) / (BPS_DENOMINATOR - feeBps);
};

const fromElUSD = (amount: bigint, tokenDecimals: number) => {
  if (tokenDecimals === 18) return amount;
  return tokenDecimals < 18 ? amount / 10n ** BigInt(18 - tokenDecimals) : amount * 10n ** BigInt(tokenDecimals - 18);
};

const getTokenDecimals = (config: any) => Number(config.decimals ?? config[0]);

const getCachedTokenConfig = (options: FetchOptions, tokenConfigCache: Map<string, Promise<any>>, token: string, block: number) => {
  const cacheKey = token.toLowerCase();
  const cachedConfig = tokenConfigCache.get(cacheKey);
  if (cachedConfig) return cachedConfig;

  const config = options.api.call({ target: TOKEN_REGISTRY, abi: ABI.getTokenConfig, params: [token], block });
  tokenConfigCache.set(cacheKey, config);
  return config;
};

const calculateGrossRedeemAmount = async (options: FetchOptions, log: any, tokenConfigCache: Map<string, Promise<any>>) => {
  const [config, rawPrice] = await Promise.all([
    getCachedTokenConfig(options, tokenConfigCache, log.token, log.blockNumber),
    options.api.call({ target: PRICE_ORACLE, abi: ABI.getPrice, params: [log.token], block: log.blockNumber }),
  ]);

  // Match Vault redemption math: sub-$1 collateral prices are floored at $1 to protect protocol solvency.
  const price = toBigInt(rawPrice) < ONE_DOLLAR ? ONE_DOLLAR : toBigInt(rawPrice);
  const normalizedAmount = (toBigInt(log.elUSDAmountIn) * ONE_DOLLAR) / price;
  return fromElUSD(normalizedAmount, getTokenDecimals(config));
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const redeemLogs = await options.getLogs({ target: VAULT, eventAbi: ABI.redeemed });
  const redemptionFeeUpdateLogs = await options.getLogs({ target: VAULT, eventAbi: ABI.redemptionFeeUpdated });
  const managementFeeUpdateLogs = await options.getLogs({ target: VAULT, eventAbi: ABI.managementFeeUpdated });
  const managementFeeAccruedLogs = await options.getLogs({ target: VAULT, eventAbi: ABI.managementFeeAccrued });
  const feesCollectedLogs = await options.getLogs({ target: VAULT, eventAbi: ABI.feesCollected });
  const stakingYieldLogs = await options.getLogs({
    target: ELUSD,
    eventAbi: ABI.transfer,
    topics: [TRANSFER_TOPIC, ZERO_ADDRESS_TOPIC, topicAddress(STAKING)],
  });
  const startingRedemptionFee = await options.fromApi.call({ target: VAULT, abi: ABI.redemptionFee });
  const startingManagementFee = await options.fromApi.call({ target: VAULT, abi: ABI.managementFeePercent });

  const redemptionFeeUpdates = redemptionFeeUpdateLogs
    .map((log) => ({ ...log, newFee: toBigInt(log.newFee) }))
    .sort(sortByLogPosition);
  const tokenConfigCache = new Map<string, Promise<any>>();
  let redemptionFeeUpdateIndex = 0;
  let redemptionFee = toBigInt(startingRedemptionFee);

  for (const log of redeemLogs.sort(sortByLogPosition)) {
    while (
      redemptionFeeUpdateIndex < redemptionFeeUpdates.length &&
      sortByLogPosition(redemptionFeeUpdates[redemptionFeeUpdateIndex], log) < 0
    ) {
      redemptionFee = redemptionFeeUpdates[redemptionFeeUpdateIndex].newFee;
      redemptionFeeUpdateIndex++;
    }

    const netTokenAmount = toBigInt(log.tokenAmountOut);
    const grossTokenAmount = await calculateGrossRedeemAmount(options, log, tokenConfigCache);
    const exactFee = (grossTokenAmount * redemptionFee) / BPS_DENOMINATOR;
    const fee = grossTokenAmount - exactFee === netTokenAmount ? exactFee : deriveRedeemFee(netTokenAmount, redemptionFee);

    dailyFees.add(log.token, fee, METRIC.MINT_REDEEM_FEES);
    dailyUserFees.add(log.token, fee, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.add(log.token, fee, REDEEM_FEE_LABEL);
    dailyProtocolRevenue.add(log.token, fee, REDEEM_FEE_LABEL);
  }

  const managementFeeUpdates = managementFeeUpdateLogs
    .map((log) => ({ ...log, newFeePercent: toBigInt(log.newFeePercent) }))
    .sort(sortByLogPosition);
  let managementFeeUpdateIndex = 0;
  let managementFeePercent = toBigInt(startingManagementFee);

  managementFeeAccruedLogs.sort(sortByLogPosition).forEach((log) => {
    while (
      managementFeeUpdateIndex < managementFeeUpdates.length &&
      sortByLogPosition(managementFeeUpdates[managementFeeUpdateIndex], log) < 0
    ) {
      managementFeePercent = managementFeeUpdates[managementFeeUpdateIndex].newFeePercent;
      managementFeeUpdateIndex++;
    }

    const managementFee = (toBigInt(log.grossNavUsd) * managementFeePercent * toBigInt(log.elapsed)) / (YEAR_IN_SECONDS * BPS_DENOMINATOR);
    addUsd(dailyFees, managementFee, METRIC.MANAGEMENT_FEES);
    addUsd(dailyUserFees, managementFee, METRIC.MANAGEMENT_FEES);
    addUsd(dailyRevenue, managementFee, MANAGEMENT_FEE_LABEL);
    addUsd(dailyProtocolRevenue, managementFee, MANAGEMENT_FEE_LABEL);
  });

  feesCollectedLogs.forEach((log) => {
    const performanceFee = toBigInt(log.performanceFeeAmount);

    addUsd(dailyFees, performanceFee, METRIC.PERFORMANCE_FEES);
    addUsd(dailyUserFees, performanceFee, METRIC.PERFORMANCE_FEES);
    addUsd(dailyRevenue, performanceFee, PERFORMANCE_FEE_LABEL);
    addUsd(dailyProtocolRevenue, performanceFee, PERFORMANCE_FEE_LABEL);
  });

  stakingYieldLogs.forEach((log) => {
    const amount = toBigInt(log.amount);
    addUsd(dailyFees, amount, METRIC.ASSETS_YIELDS);
    addUsd(dailySupplySideRevenue, amount, STAKER_YIELD_LABEL);
  });

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-06-16",
  fetch,
  methodology: {
    Fees: "Redemption fees, management fees, performance fees, and elUSD yield distributed to stakers.",
    UserFees: "Redemption fees, management fees, and performance fees paid by users.",
    Revenue: "Redemption fees retained by the treasury wallet, management fees accrued by the vault, and performance fees collected by the vault.",
    ProtocolRevenue: "Redemption, management, and performance fees allocated to the protocol.",
    SupplySideRevenue: "elUSD yield minted to the staking contract during NAV syncs.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "Redemption fees computed from emitted redemption data, oracle pricing, token config, and the active redemption fee rate.",
      [METRIC.MANAGEMENT_FEES]: "Management fees computed from ManagementFeeAccrued using gross NAV, elapsed time, and the active management fee rate.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees emitted by FeesCollected in USD 1e18 precision.",
      [METRIC.ASSETS_YIELDS]: "elUSD yield minted to the staking contract.",
    },
    UserFees: {
      [METRIC.MINT_REDEEM_FEES]: "Fees paid directly by users when redeeming elUSD.",
      [METRIC.MANAGEMENT_FEES]: "Management fees charged to vault users.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees charged on vault performance.",
    },
    Revenue: {
      [REDEEM_FEE_LABEL]: "Redeem fees retained by the Elara treasury.",
      [MANAGEMENT_FEE_LABEL]: "Management fees collected by the Elara vault.",
      [PERFORMANCE_FEE_LABEL]: "Performance fees collected by the Elara vault.",
    },
    ProtocolRevenue: {
      [REDEEM_FEE_LABEL]: "Redeem fees allocated to the Elara treasury.",
      [MANAGEMENT_FEE_LABEL]: "Management fees allocated to the protocol.",
      [PERFORMANCE_FEE_LABEL]: "Performance fees allocated to the protocol.",
    },
    SupplySideRevenue: {
      [STAKER_YIELD_LABEL]: "elUSD yield minted to stakers.",
    },
  },
};

export default adapter;
