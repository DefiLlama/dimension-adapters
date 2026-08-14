import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ChainApi, getProvider } from "@defillama/sdk";

// Factory history: https://github.com/blobsarp/indices/blob/master/indexer/ponder.config.ts
const FACTORY_ADDRESSES = [
  "0x29502Be73947fFf18343dcd98ccDa101e8E7ec49",
  "0x3450cEdfDD7F1082D766c8B8998C326D3696E8Df",
  "0x18aa4Ec817C6A87e4f123631b5EC64E945416227",
  "0xA9EE5d711f6853a630D0E363C5BD2d120EEA978c",
  "0xE2dd1Fc50f520CC36368d375bC77dAE6c7d668bC",
  "0xa83a6D9d3F3acE1564de739a3D02E1683a59cc9e",
  "0x0148698731f87900073Bb6e94aF1624Dff5E78FB",
];

// Robinhood deployments: https://robinhoodchain.blockscout.com/
const LEGACY_DISTRIBUTORS = [
  "0x33B0095333e64bf375952eF197b6FDC3437dc014",
  "0x02241379056fd5c2BDe0bDfc63D2b272C18A49bE",
  "0x2459DedB3012d1E929EdD17DF26620120bDF11bf",
  "0x39ADB8acD07427D338b5f1AfAb436A04AbFdB7c4",
];

// Reward vault V2: https://robinhoodchain.blockscout.com/address/0xEe7d053cE44D689455765CE1c3c64c5c28EA4088
const REWARD_FACTORY_V1 = "0x01502F8fEff66295E368f0cb1F75BD6Fb6Bc1e93";
const REWARD_VAULT_V1 = "0x2Ea2BdC5Af31CB9914d3F3d41B209ee815ad5363";
const REWARD_VAULT_V2 = "0xEe7d053cE44D689455765CE1c3c64c5c28EA4088";
// V1 factory deployment: https://robinhoodchain.blockscout.com/block/15904781
const REWARD_V1_START_BLOCK = 15_904_781;

// First Index Treasury factory deployment: https://robinhoodchain.blockscout.com/block/23570628
const EARLIEST_DEPLOY_BLOCK = 23_570_628;
const ZERO = "0x0000000000000000000000000000000000000000";

const abi = {
  TreasuryDeployed:
    "event TreasuryDeployed(address indexed treasury, address indexed creator, address numeraire, bytes32 basketHash, bytes32 salt)",
  Harvested:
    "event Harvested(uint256 netCredit, uint256 toDistributable, uint256 toCreator, uint256 protocolFee, uint256 vestTokens)",
  RoundFinalized:
    "event RoundFinalized(uint256 indexed roundId, uint96 paidSum, uint96 remainder)",
  Round:
    "function rounds(uint256) view returns (address asset, uint96 pot, uint64 epochStartBlock, uint64 epochEndBlock, uint40 openedAt, uint40 commitTime, uint32 leafCount, uint32 leavesPaid, uint8 status, bytes32 root, uint96 totalCommitted, uint96 paidSum)",
  Distributed:
    "event Distributed(address indexed stock, uint256 amount, uint256 holders)",
  RewardLaunchedV1:
    "event Launched(address indexed token, bytes32 indexed id, address indexed stock, address creator, uint160 startSqrtPriceX96, bool shaped)",
  RewardCrankedV1:
    "event Cranked(bytes32 indexed id, uint256 rakeCreator, uint256 rakeTreasury, uint256 tip, uint256 gasRes, uint256 buybackEthUsed, uint256 tokensBurned, uint256 stockDelivered, uint256 retained)",
  RewardCrankedV2:
    "event Cranked(bytes32 indexed id, address indexed stock, uint256 rakeCreator, uint256 rakeTreasury, uint256 tip, uint256 gasRes, uint256 buybackEthUsed, uint256 tokensBurned, uint256 stockDelivered, uint256 retained)",
};

const labels = {
  fees: "Creator Coin Taxes",
  protocol: "Creator Coin Taxes To Protocol",
  creators: "Creator Coin Taxes To Coin Creators",
  legacyFees: "Original INDEX Swap Taxes",
  legacyHolderPayouts: "Original INDEX Stock Distributions",
  rewardLaunchFees: "Earn-A-Stock Launch Fees",
  rewardLaunchPayouts: "Earn-A-Stock Launch Distributions",
  holderPayouts: "Index Treasury Stock Distributions",
};

const logAddress = (log: any) => String(log.address).toLowerCase();

const addAsset = (
  balances: any,
  asset: string,
  amount: unknown,
  label: string,
) => {
  if (asset === ZERO) balances.addGasToken(amount, label);
  else balances.addToken(asset, amount, label);
};

export const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const legacyDistributionLogs = await options.getLogs({
    targets: LEGACY_DISTRIBUTORS,
    eventAbi: abi.Distributed,
  });

  for (const log of legacyDistributionLogs) {
    const { stock, amount } = log;
    const asset = String(stock).toLowerCase();
    addAsset(dailyFees, asset, amount, labels.legacyFees);
    addAsset(dailyUserFees, asset, amount, labels.legacyFees);
    addAsset(dailyRevenue, asset, amount, labels.legacyHolderPayouts);
    addAsset(dailyHoldersRevenue, asset, amount, labels.legacyHolderPayouts);
  }

  const rewardLaunchesV1 = await options.getLogs({
    eventAbi: abi.RewardLaunchedV1,
    target: REWARD_FACTORY_V1,
    fromBlock: REWARD_V1_START_BLOCK,
    cacheInCloud: true,
  });

  const rewardStockOfPool = new Map<string, string>();
  for (const log of rewardLaunchesV1) {
    const { id, stock } = log;
    rewardStockOfPool.set(
      String(id).toLowerCase(),
      String(stock).toLowerCase(),
    );
  }
  const rewardCranksV1 = await options.getLogs({
    eventAbi: abi.RewardCrankedV1,
    target: REWARD_VAULT_V1,
  });
  const rewardCranksV2 = await options.getLogs({
    eventAbi: abi.RewardCrankedV2,
    target: REWARD_VAULT_V2,
  });
  const addRewardLaunchDistribution = (asset: string, amount: unknown) => {
    addAsset(dailyFees, asset, amount, labels.rewardLaunchFees);
    addAsset(dailyUserFees, asset, amount, labels.rewardLaunchFees);
    addAsset(dailyRevenue, asset, amount, labels.rewardLaunchPayouts);
    addAsset(dailyHoldersRevenue, asset, amount, labels.rewardLaunchPayouts);
  };
  for (const log of rewardCranksV1) {
    const { id, stockDelivered } = log;
    const stock = rewardStockOfPool.get(String(id).toLowerCase());
    if (!stock)
      throw new Error(`Missing reward-launch stock for pool ${String(id)}`);
    addRewardLaunchDistribution(stock, stockDelivered);
  }
  for (const log of rewardCranksV2) {
    const { stock, stockDelivered } = log;
    addRewardLaunchDistribution(String(stock).toLowerCase(), stockDelivered);
  }

  const deployLogs = await options.getLogs({
    eventAbi: abi.TreasuryDeployed,
    targets: FACTORY_ADDRESSES,
    onlyArgs: false,
    entireLog: true,
    parseLog: true,
    fromBlock: EARLIEST_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const numeraireOf = new Map<string, string>();
  for (const log of deployLogs) {
    const { treasury, numeraire } = log.args;
    numeraireOf.set(
      String(treasury).toLowerCase(),
      String(numeraire).toLowerCase(),
    );
  }
  const treasuries = [...numeraireOf.keys()];

  if (!treasuries.length) {
    return {
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue,
    };
  }

  const harvestLogs = await options.getLogs({
    targets: treasuries,
    eventAbi: abi.Harvested,
    entireLog: true,
    parseLog: true,
  });

  const finalizedLogs = await options.getLogs({
    targets: treasuries,
    eventAbi: abi.RoundFinalized,
    entireLog: true,
    parseLog: true,
  });

  for (const log of harvestLogs) {
    const numeraire = numeraireOf.get(logAddress(log));
    if (!numeraire)
      throw new Error(`Missing numeraire for treasury ${logAddress(log)}`);
    const { netCredit, toCreator, protocolFee } = log.args;
    const grossFees = BigInt(netCredit) + BigInt(protocolFee);

    addAsset(dailyFees, numeraire, grossFees, labels.fees);
    addAsset(dailyUserFees, numeraire, grossFees, labels.fees);
    addAsset(dailyRevenue, numeraire, protocolFee, labels.protocol);
    addAsset(dailyProtocolRevenue, numeraire, protocolFee, labels.protocol);
    addAsset(dailySupplySideRevenue, numeraire, toCreator, labels.creators);
  }

  const finalizedRounds = finalizedLogs.length
    ? await options.api.multiCall({
        abi: abi.Round,
        calls: finalizedLogs.map((log: any) => ({
          target: logAddress(log),
          params: [String(log.args.roundId)],
        })),
      })
    : [];
  for (let i = 0; i < finalizedLogs.length; i++) {
    const log = finalizedLogs[i];
    const { roundId, paidSum } = log.args;
    if (!finalizedRounds[i]?.asset) {
      throw new Error(`Missing asset for finalized round ${String(roundId)}`);
    }
    const asset = String(finalizedRounds[i].asset).toLowerCase();
    addAsset(dailySupplySideRevenue, asset, paidSum, labels.holderPayouts);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Original INDEX and earn-a-stock taxes settled into stock distributions, plus gross creator-coin taxes harvested by Index Treasuries (Harvested.netCredit plus Harvested.protocolFee).",
  UserFees:
    "Same as Fees: both generations originate from taxes paid by protocol users.",
  Revenue:
    "Original INDEX and earn-a-stock distributions settled for $INDEX holders, plus the Index Treasury protocol fee.",
  ProtocolRevenue:
    "The protocolFee portion of each harvest, allocated to The Index protocol.",
  SupplySideRevenue:
    "The toCreator portion of each harvest, claimable by the launched coin's creator, plus finalized Index Treasury paidSum stock paid to launched-coin holders; skipped and unpaid leaves are excluded.",
  HoldersRevenue:
    "Original INDEX Distributed stock pots and earn-a-stock Cranked deliveries to $INDEX holders.",
};

const breakdownMethodology = {
  Fees: {
    [labels.legacyFees]:
      "Original INDEX 3% swap tax, measured after conversion into stock.",
    [labels.rewardLaunchFees]:
      "Earn-a-stock launch fees, measured after conversion into stock.",
    [labels.fees]: "Gross creator-coin taxes harvested by Index Treasuries.",
  },
  UserFees: {
    [labels.legacyFees]: "Original INDEX swap taxes paid by traders.",
    [labels.rewardLaunchFees]: "Earn-a-stock launch fees paid by traders.",
    [labels.fees]: "Creator-coin taxes paid by traders.",
  },
  Revenue: {
    [labels.legacyHolderPayouts]:
      "Original INDEX stock pot settled for token holders.",
    [labels.rewardLaunchPayouts]:
      "Earn-a-stock launch rewards settled for token holders.",
    [labels.protocol]: "Protocol fee retained by The Index.",
  },
  ProtocolRevenue: { [labels.protocol]: methodology.ProtocolRevenue },
  SupplySideRevenue: {
    [labels.creators]:
      "The toCreator portion of each harvest, claimable by the launched coin's creator.",
    [labels.holderPayouts]:
      "RoundFinalized.paidSum stock paid to launched-coin holders; skipped and unpaid leaves are excluded.",
  },
  HoldersRevenue: {
    [labels.legacyHolderPayouts]:
      "Stock pots settled by all four historical $INDEX distributors.",
    [labels.rewardLaunchPayouts]:
      "Stock delivered by both historical earn-a-stock reward vaults.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-02",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
