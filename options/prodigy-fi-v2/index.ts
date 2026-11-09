import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const WAD = 10n ** 18n;

const VAULT_CREATED = "event VaultCreated(address indexed owner,address indexed baseToken,address indexed quoteToken,address vaultAddress,tuple(address owner,address vaultBatchManager,address linkedToken,address investmentToken,address aggregator,bytes32 priceFeed,uint256 expiry,uint256 linkedPrice,int256 linkedOraclePrice,uint256 yieldValue,bool isBuyLow,uint256 quantity,uint256 depositDeadline,uint64 minConfidenceRatio,address collateralPool,uint256 tradingFeeRate,address feeReceiver,int256 oraclePriceAtCreation,address signer) vaultParams,uint8 vaultSeriesVersion)";
const DEPOSIT = "event Deposit(address indexed user,uint256 depositAmount,int256 oraclePriceAtDeposit,uint256 yieldValue)";

type ChainConfig = {
  positionManager: string;
  fromBlock: number;
  start: string;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    fromBlock: 25918063,
    start: "2026-09-06",
  },
  [CHAIN.BASE]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    fromBlock: 50952480,
    start: "2026-09-06",
  },
  [CHAIN.HYPERLIQUID]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    fromBlock: 45059824,
    start: "2026-09-05",
  },
  [CHAIN.BERACHAIN]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    fromBlock: 25783809,
    start: "2026-09-05",
  },
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { positionManager, fromBlock } = config[options.chain];
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const vaultCreatedLogs = await options.getLogs({
    target: positionManager,
    eventAbi: VAULT_CREATED,
    fromBlock,
    cacheInCloud: true,
  });
  const vaultInvestmentToken = new Map<string, string>();
  vaultCreatedLogs.forEach((log: any) => {
    vaultInvestmentToken.set(log.vaultAddress.toLowerCase(), log.vaultParams.investmentToken);
  });

  const depositLogs = await options.getLogs({
    noTarget: true, // a new vault clone per strike/expiry, thousands per chain, so fetch by topic and keep Prodigy vaults only
    eventAbi: DEPOSIT,
    entireLog: true,
    parseLog: true,
  });

  depositLogs.forEach((log: any) => {
    const investmentToken = vaultInvestmentToken.get(log.address.toLowerCase());
    if (!investmentToken) return;
    const depositAmount = BigInt(log.args.depositAmount);
    dailyNotionalVolume.add(investmentToken, depositAmount);
    dailyPremiumVolume.add(investmentToken, depositAmount * BigInt(log.args.yieldValue) / WAD);
  });

  return { dailyNotionalVolume, dailyPremiumVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology: {
    NotionalVolume: "Principal deposited by users into Prodigy.Fi DCI vaults, counted in each vault's investment token. Vault capacity listed by Prodigy but not filled by users is excluded.",
    PremiumVolume: "Yield earned by depositors on that principal, computed as the deposited amount multiplied by the vault's yield at deposit time.",
  },
};

export default adapter;
