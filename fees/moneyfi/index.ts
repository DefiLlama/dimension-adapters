import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// MoneyFi V2 BSC deployment; registry: https://bscscan.com/address/0x3B46e8E9533545fd751365386Ca298e64598c5DF
const V2_BSC_START_BLOCK = 113632649;
const V2_BSC_VAULTS = [
  "0xC45f0c6a22dd5bA2fa75b803bBabc67CC212838c",
  "0xBC96E51AE3A3D0A32091396339a0c2B68DF97e2A",
  "0xf3400439439c911952E9949B6A522Ed78504A253",
];
const V2_BSC_ASSET = "0x55d398326f99059fF775485246999027B3197955"; // Binance-Peg USDT
const V2_FEES_UPDATED = "event FeesUpdated(uint256 managementFeeAssets,uint256 managementFeeShares,uint256 performanceFeeAssets,uint256 performanceFeeShares,uint256 postFeePps)";
const V2_DEPOSIT_SETTLED = "event DepositEpochSettled(uint64 indexed epochId,uint256 grossAssets,uint256 feeAssets,bool feeCovered,uint256 netAssets,uint256 shares,uint256 pps)";
const V2_REDEEM_SETTLED = "event RedeemEpochSettled(uint64 indexed epochId,uint256 shares,uint256 grossAssets,uint256 feeAssets,bool feeCovered,uint256 netAssets,uint256 pps)";
const PPS_SCALE = 10n ** 18n;

const METRICS = {
  LEGACY_VAULT_YIELD: "Legacy Vault Yield",
  LEGACY_YIELD_TO_DEPOSITORS: "Legacy Vault Yield To Depositors",
  LEGACY_FEES_TO_PROTOCOL: "Legacy Performance Fees To Protocol",
  V2_VAULT_YIELD: "V2 Vault Yield And Management Fees",
  V2_YIELD_TO_DEPOSITORS: "V2 Vault Yield To Depositors",
  V2_FEES_TO_PROTOCOL: "V2 Crystallized Fees To Protocol",
};

const CHAINS_CONFIG: Record<string, { contracts: { address: string; decimals: number }[] }> = {
  [CHAIN.ETHEREUM]: {
    contracts: [
      { address: "0x6Df81526F93cd5C66B2B509baeB91bDB832C9a85", decimals: 6 },
      { address: "0x5FD182547BDAbd26e2e2465c5602B0Ec99180cdd", decimals: 6 },
    ],
  },
  [CHAIN.BASE]: {
    contracts: [
      { address: "0x201E3c8BCcBB6e23710fEdAB9a28E806ef3240eb", decimals: 6 },
      { address: "0x2DF1200660Fbb6AE1b3D64BcB88988ceaCcb0FD3", decimals: 6 },
    ],
  },
  [CHAIN.CORE]: {
    contracts: [
      { address: "0xf9139312E668EE8011F6c594ba24271eE5C913d5", decimals: 6 },
      { address: "0x5ADB96e1728Eb6493C2E0033eC70F829CaD83b1b", decimals: 6 },
    ],
  },
  [CHAIN.ARBITRUM]: {
    contracts: [
      { address: "0x2daa2dc0651f9e019f1860f0BF04B77C3Fad6110", decimals: 6 },
      { address: "0x291521205f8dEaf167118efC03279C8cF80DB684", decimals: 6 },
    ],
  },
  [CHAIN.POLYGON]: {
    contracts: [
      { address: "0x8BE37856993A4758e07F59Cd26651942dD948310", decimals: 6 },
      { address: "0x2D363A4Ed846fa0eaA3884C25922a6552aAE96D6", decimals: 6 },
    ],
  },
  [CHAIN.BSC]: {
    contracts: [
      { address: "0xB17a12fEBcFc3a22086e50D4bEC480540fb2A30F", decimals: 18 },
      { address: "0x531Fdc85267838690d66443847A9fb759D2813C3", decimals: 18 },
    ],
  },
  [CHAIN.OPTIMISM]: {
    contracts: [
      { address: "0xB4e0C6A1542197f06514c111b6F3DCE7B250897F", decimals: 6 },
      { address: "0xD79683499F50a9e8D1aa3F9980b9bcdDdd553e8e", decimals: 6 },
    ],
  },
  [CHAIN.SONEIUM]: {
    contracts: [
      { address: "0x03afBc04c44d648DD59fC9CafB2B00730Bf42593", decimals: 6 },
      { address: "0xb17ED50d2D5C3CACaf5b81e89C15b95B7Ce2CfB5", decimals: 6 },
    ],
  }
};


const abiWithdraw = "event WithdrawFundCrossChainFromOperator(address indexed receiver,address indexed tokenOut,bytes transportMsg,uint256 totalAmountOut,uint256 protocolFee,uint256 referralFee,uint256 withdrawFee,uint256 withdrawAt)";

const abiRebalance = "event RebalanceFundSameChain(address indexed strategyAddress,address indexed userAddress,address indexed underlyingAsset,uint256 receivedAmount,int256 receivedReward,uint256 protocolFee,uint256 referralFee,uint256 rebalanceFee,uint256 rebalancedAt)";

function eventArg(args: any, name: string, index: number): bigint {
  return BigInt(args?.[name] ?? args?.[index] ?? 0);
}

type V2VaultEvent = {
  vault: string;
  blockNumber: number;
  logIndex: number;
  kind: "fees" | "deposit" | "redeem";
  args: any;
};

function positionedV2Event(log: any, kind: V2VaultEvent["kind"]): V2VaultEvent {
  const blockNumber = Number(log?.blockNumber ?? log?.block_number ?? log?.block);
  const logIndex = Number(log?.logIndex ?? log?.log_index ?? log?.index);
  const vault = String(log?.address ?? "").toLowerCase();
  if (!vault || !log?.args || !Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) {
    throw new Error(`MoneyFi V2 ${kind} log is missing address, position, or decoded args`);
  }
  return { vault, blockNumber, logIndex, kind, args: log.args };
}

async function addV2BscFees(
  options: FetchOptions,
  dailyFees: ReturnType<FetchOptions["createBalances"]>,
  dailyRevenue: ReturnType<FetchOptions["createBalances"]>,
  dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>,
) {
  const toBlock = await options.getToBlock();
  if (toBlock < V2_BSC_START_BLOCK) return;

  const fromBlock = await options.getFromBlock();
  const [feeLogs, depositLogs, redeemLogs] = await Promise.all([
    options.getLogs({
      targets: V2_BSC_VAULTS,
      eventAbi: V2_FEES_UPDATED,
      onlyArgs: false,
      flatten: true,
      fromBlock: V2_BSC_START_BLOCK,
      cacheInCloud: true,
    }),
    options.getLogs({
      targets: V2_BSC_VAULTS,
      eventAbi: V2_DEPOSIT_SETTLED,
      onlyArgs: false,
      flatten: true,
      fromBlock: V2_BSC_START_BLOCK,
      cacheInCloud: true,
    }),
    options.getLogs({
      targets: V2_BSC_VAULTS,
      eventAbi: V2_REDEEM_SETTLED,
      onlyArgs: false,
      flatten: true,
      fromBlock: V2_BSC_START_BLOCK,
      cacheInCloud: true,
    }),
  ]);
  const assetByVault = new Map(V2_BSC_VAULTS.map((vault) => [vault.toLowerCase(), V2_BSC_ASSET]));
  const events = [
    ...(feeLogs as any[]).map((log) => positionedV2Event(log, "fees")),
    ...(depositLogs as any[]).map((log) => positionedV2Event(log, "deposit")),
    ...(redeemLogs as any[]).map((log) => positionedV2Event(log, "redeem")),
  ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  // Shares are non-transferable and the current Vault implementation changes
  // supply only through these fee/deposit/redeem paths. Extend this replay if a
  // future implementation introduces another mint or burn path.
  const states = new Map(
    V2_BSC_VAULTS.map((vault) => [vault.toLowerCase(), { supply: 0n, postFeePps: PPS_SCALE }]),
  );

  for (const event of events) {
    const state = states.get(event.vault);
    if (!state) throw new Error(`MoneyFi V2 event emitted by unknown Vault ${event.vault}`);

    if (event.kind === "deposit") {
      state.supply += eventArg(event.args, "shares", 5);
      state.postFeePps = eventArg(event.args, "pps", 6);
      continue;
    }
    if (event.kind === "redeem") {
      const burnedShares = eventArg(event.args, "shares", 1);
      if (burnedShares > state.supply) throw new Error(`MoneyFi V2 replay underflow for ${event.vault}`);
      state.supply -= burnedShares;
      state.postFeePps = eventArg(event.args, "pps", 6);
      continue;
    }

    const managementFeeShares = eventArg(event.args, "managementFeeShares", 1);
    const performanceFeeShares = eventArg(event.args, "performanceFeeShares", 3);
    const totalFeeShares = managementFeeShares + performanceFeeShares;
    const postFeePps = eventArg(event.args, "postFeePps", 4);
    const netYield = (postFeePps - state.postFeePps) * state.supply / PPS_SCALE;
    const managementFees = managementFeeShares * postFeePps / PPS_SCALE;
    const protocolRevenue = totalFeeShares * postFeePps / PPS_SCALE;

    if (event.blockNumber > fromBlock && event.blockNumber <= toBlock) {
      const token = assetByVault.get(event.vault);
      if (!token) throw new Error(`MoneyFi V2 Vault ${event.vault} has no underlying asset`);

      // postFeePps is net of both fee types. Add management fees back to the
      // supplier side because DefiLlama classifies them as a separate charge.
      const depositorYield = netYield + managementFees;
      const totalFees = depositorYield + protocolRevenue;
      if (totalFees !== 0n) dailyFees.add(token, totalFees, METRICS.V2_VAULT_YIELD);
      if (depositorYield !== 0n) {
        dailySupplySideRevenue.add(token, depositorYield, METRICS.V2_YIELD_TO_DEPOSITORS);
      }
      if (protocolRevenue !== 0n) {
        dailyRevenue.add(token, protocolRevenue, METRICS.V2_FEES_TO_PROTOCOL);
      }
    }

    state.supply += totalFeeShares;
    state.postFeePps = postFeePps;
  }
}


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const cfg = CHAINS_CONFIG[options.chain];

  for (const { address, decimals } of cfg.contracts) {

    const withdrawLogs = await options.getLogs({
      target: address,
      eventAbi: abiWithdraw,
    });

    if (withdrawLogs.length > 0) {
      withdrawLogs.forEach((ev: any) => {
        const protocolFee = ev[4];
        const scale = 10n ** BigInt(decimals);
        const normalizedFee = Number(protocolFee) / Number(scale);
        dailyFees.addUSDValue(normalizedFee * 5, METRICS.LEGACY_VAULT_YIELD);
        dailyUserFees.addUSDValue(normalizedFee * 5, METRICS.LEGACY_VAULT_YIELD);
        dailyRevenue.addUSDValue(normalizedFee, METRICS.LEGACY_FEES_TO_PROTOCOL);
        dailySupplySideRevenue.addUSDValue(normalizedFee * 4, METRICS.LEGACY_YIELD_TO_DEPOSITORS);
      });
    }

    const rebalanceLogs = await options.getLogs({
      target: address,
      eventAbi: abiRebalance,
    });

    if (rebalanceLogs.length > 0) {
      rebalanceLogs.forEach((ev: any) => {
        const protocolFee = ev[5];
        const scale = 10n ** BigInt(decimals);
        const normalizedFee = Number(protocolFee) / Number(scale);
        dailyFees.addUSDValue(normalizedFee * 5, METRICS.LEGACY_VAULT_YIELD);
        dailyUserFees.addUSDValue(normalizedFee * 5, METRICS.LEGACY_VAULT_YIELD);
        dailyRevenue.addUSDValue(normalizedFee, METRICS.LEGACY_FEES_TO_PROTOCOL);
        dailySupplySideRevenue.addUSDValue(normalizedFee * 4, METRICS.LEGACY_YIELD_TO_DEPOSITORS);
      });
    }
  }

  if (options.chain === CHAIN.BSC) {
    await addV2BscFees(options, dailyFees, dailyRevenue, dailySupplySideRevenue);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const fetchAptos = async () => {
  const res = await fetchURL("https://api.moneyfi.fund/get-fees");

  const daily = res?.fees?.daily ?? 0;

  return {
    dailyFees: daily * 5,
    dailyRevenue: daily,
    dailyProtocolRevenue: daily,
    dailySupplySideRevenue: daily * 4,
    dailyUserFees: daily * 5,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  // pullHourly disabled: the Aptos branch returns a full daily total from the API,
  // so hourly bucketing would over-count it ~24x. Daily window is fine for the EVM log ranges.
  pullHourly: false,
  methodology: {
    Fees: "Gross yield generated between MoneyFi Vault checkpoints plus management fees charged on managed assets.",
    UserFees: "Legacy MoneyFi gross vault yield retained for continuity with the existing adapter. V2 vault yield is not classified as a direct user-paid fee.",
    Revenue: "Protocol fees retained by MoneyFi. V2 values management and performance fee shares when they are crystallized.",
    ProtocolRevenue: "Revenue allocated to the MoneyFi protocol treasury.",
    SupplySideRevenue: "Checkpoint-to-checkpoint Vault yield accruing to depositors after performance fees. Negative values represent negative Vault returns."
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.LEGACY_VAULT_YIELD]: "Gross Vault yield inferred from legacy on-chain protocol fee events and the legacy 20% fee split.",
      [METRICS.V2_VAULT_YIELD]: "V2 BSC yield reconstructed from post-fee share-price growth and replayed share supply, grossed up for crystallized fees, plus management fees.",
    },
    UserFees: {
      [METRICS.LEGACY_VAULT_YIELD]: "Legacy gross Vault yield retained under the adapter's historical user-fee classification.",
    },
    Revenue: {
      [METRICS.LEGACY_FEES_TO_PROTOCOL]: "Protocol fee emitted by legacy MoneyFi Vault operations.",
      [METRICS.V2_FEES_TO_PROTOCOL]: "Value of management and performance fee shares crystallized by MoneyFi V2 Vaults.",
    },
    ProtocolRevenue: {
      [METRICS.LEGACY_FEES_TO_PROTOCOL]: "Legacy protocol fees allocated to MoneyFi.",
      [METRICS.V2_FEES_TO_PROTOCOL]: "V2 crystallized Vault fees allocated to MoneyFi.",
    },
    SupplySideRevenue: {
      [METRICS.LEGACY_YIELD_TO_DEPOSITORS]: "Legacy Vault yield accruing to depositors after the protocol fee.",
      [METRICS.V2_YIELD_TO_DEPOSITORS]: "V2 Vault post-fee share-price return with management fees added back, equivalent to gross yield less performance fees.",
    },
  },
  // Negative values reflect negative Vault returns between on-chain checkpoints.
  allowNegativeValue: true,
  adapter: {
    ...Object.fromEntries(
      Object.keys(CHAINS_CONFIG).map(chain => [
        chain,
        {
          fetch,
          start: "2025-05-27",
        },
      ])
    ),
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      runAtCurrTime: true,
      start: "2025-05-27",
    }
  },
};


export default adapter;
