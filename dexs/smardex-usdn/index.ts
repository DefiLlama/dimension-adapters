import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { ethers } from "ethers";

// Configuration
const CONFIG = {
  TOKENS: {
    USDN: "0xde17a000ba631c5d7c2bd9fb692efea52d90dee2",
    WSTETH: ADDRESSES.ethereum.WSTETH,
  },
  CONTRACTS: {
    USDN: "0x656cb8c6d154aad29d8771384089be5b5141f01a",
    DIP_ACCUMULATOR: "0xaebcc85a5594e687f6b302405e6e92d616826e03",
  },
};

// ABIs
const usdnAbi = {
  vaultDepositEvent: "event ValidatedDeposit(address indexed to, address indexed validator, uint256 amountAfterFees, uint256 usdnMinted, uint256 timestamp)",
  vaultWithdrawalEvent: "event ValidatedWithdrawal(address indexed to, address indexed validator, uint256 amountWithdrawnAfterFees, uint256 usdnBurned, uint256 timestamp)",
  longOpenPositionEvent: "event InitiatedOpenPosition(address indexed owner, address indexed validator, uint40 timestamp, uint128 totalExpo, uint128 amount, uint128 startPrice, tuple(int24 tick, uint256 tickVersion, uint256 index) posId)",
  longClosePositionEvent: "event ValidatedClosePosition(address indexed validator, address indexed to, tuple(int24 tick, uint256 tickVersion, uint256 index) posId, uint256 amountReceived, int256 profit)",
  rebalancerDepositEvent: "event AssetsDeposited(address indexed user, uint256 amount, uint256 positionVersion)",
  rebalancerWithdrawalEvent: "event AssetsWithdrawn(address indexed user, address indexed to, uint256 amount)",
  liquidatedTickEvent: "event LiquidatedTick(int24 indexed tick, uint256 indexed oldTickVersion, uint256 liquidationPrice, uint256 effectiveTickPrice, int256 remainingCollateral)",
  liquidatorRewarded: "event LiquidatorRewarded (address indexed liquidator, uint256 rewards)",
};

const eventConfigs = [
  {
    abi: usdnAbi.longOpenPositionEvent,
    token: CONFIG.TOKENS.WSTETH,
    valueIndex: 4,
    contract: CONFIG.CONTRACTS.USDN,
  },
  {
    abi: usdnAbi.longClosePositionEvent,
    token: CONFIG.TOKENS.WSTETH,
    valueIndex: 3,
    contract: CONFIG.CONTRACTS.USDN,
  },
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  for (const config of eventConfigs) {
    const logs = await options.getLogs({
      eventAbi: config.abi,
      target: config.contract,
      entireLog: true,
    });

    const iface = new ethers.Interface([config.abi]);
    for (const log of logs) {
      const parsedLog = iface.parseLog(log)
      const valueDecoded = parsedLog!.args[config.valueIndex] as bigint;
      dailyVolume.add(config.token, Number(valueDecoded));
    }
  }

  return {
    dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-01-22',
    },
  },
};

export default adapter;
