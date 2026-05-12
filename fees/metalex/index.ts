import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const FACTORY = "0x51413048f3dfc4516e95bc8e249341b1d53b6cb2";

const CONFIG = {
  [CHAIN.ETHEREUM]: {
    fromBlock: 22469387,
  },
  [CHAIN.BASE]: {
    // Additional active Base factories appear to include mixed production and test/demo usage.
    fromBlock: 30144156,
  },
  [CHAIN.ARBITRUM]: {
    fromBlock: 336006373,
  },
} as const;

const corpDeployedAbi =
  "event CyberCorpDeployed(address indexed cyberCorp, address indexed auth, address indexed issuanceManager, address dealManager, string cyberCORPName, string cyberCORPType, string cyberCORPContactDetails, string cyberCORPJurisdiction, string defaultDisputeResolution, address companyPayable)";
const roundManagerAbi =
  "event RoundManagerDeployed(address indexed cyberCorp, address indexed roundManager)";
const feeDistributedAbi =
  "event FeeDistributed(bytes32 indexed agreementId, address indexed feeToken, uint256 totalFe)";

const isValid = (address?: string) =>
  !!address && address.toLowerCase() !== ADDRESSES.null;

const managerCache: Record<string, Promise<string[]>> = {};

async function discoverManagers(options: FetchOptions) {
  const chain = options.chain;
  if (!managerCache[chain]) {
    managerCache[chain] = (async () => {
      const { fromBlock } = CONFIG[chain as keyof typeof CONFIG];

      const [corpLogs, roundLogs] = await Promise.all([
        options.getLogs({
          target: FACTORY,
          fromBlock,
          eventAbi: corpDeployedAbi,
          onlyArgs: true,
          cacheInCloud: true,
        }),
        options.getLogs({
          target: FACTORY,
          fromBlock,
          eventAbi: roundManagerAbi,
          onlyArgs: true,
          cacheInCloud: true,
        }),
      ]);

      const dealManagers = [
        ...new Set(corpLogs.map((log: any) => log.dealManager?.toLowerCase()).filter(isValid)),
      ];
      const roundManagers = [
        ...new Set(roundLogs.map((log: any) => log.roundManager?.toLowerCase()).filter(isValid)),
      ];

      return [...new Set([...dealManagers, ...roundManagers])];
    })().catch((e) => {
      delete managerCache[chain];
      throw e;
    });
  }

  return managerCache[chain];
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();

  const managers = new Set(await discoverManagers(options));
  if (!managers.size)
    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };

  const feeLogs = await options.getLogs({
    targets: [...managers],
    eventAbi: feeDistributedAbi,
    cacheInCloud: true,
  });

  feeLogs.forEach((log: any) => {
    dailyFees.add(String(log.feeToken).toLowerCase(), log.totalFe, METRIC.SERVICE_FEES);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "Tracks the 0.3% service fee charged by MetaLeX when fundraising escrows are finalized.",
  Revenue:
    "100% of this 0.3% service fee is retained by MetaLeX as revenue.",
  ProtocolRevenue:
    "100% of this 0.3% service fee accrues to the MetaLeX protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "MetaLeX 0.3% escrow finalization service fee collected via FeeDistributed events from active DealManager/RoundManager contracts.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "MetaLeX 0.3% escrow finalization service fee collected via FeeDistributed events from active DealManager/RoundManager contracts.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "MetaLeX 0.3% escrow finalization service fee collected via FeeDistributed events from active DealManager/RoundManager contracts.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM],
  start: "2025-12-12",
  methodology,
  breakdownMethodology,
};

export default adapter;
