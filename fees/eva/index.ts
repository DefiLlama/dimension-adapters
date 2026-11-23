import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// eva "mastermind" vault registry (proxy), deployed at block 24723487; every vault is registered here.
// Previously read from the eva indexer (gateway.eva.markets/subgraph, then an Envio HyperIndex URL), which went down twice.
const MASTERMIND = "0xea2bc9417f776fe5509a1e68cd26e0d76bcd01b2";
const MASTERMIND_DEPLOY_BLOCK = 24723487;

const abis = {
  VaultRegistered: "event VaultRegistered(address indexed vault, address indexed underlying, address indexed market)",
  // Emitted by each vault when excess backing is skimmed: `amount` vault shares (1:1 with the underlying) are minted to the treasury.
  // e.g. tx 0x548e1561f6f7f8969552599e8682a42e912802b2bd148a453a351481157d11f8
  Skimmed: "event Skimmed(address indexed treasury, uint256 amount)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const registrations = await options.getLogs({
    target: MASTERMIND,
    eventAbi: abis.VaultRegistered,
    fromBlock: MASTERMIND_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const underlyingByVault: Record<string, string> = {};
  registrations.forEach(({ vault, underlying }: any) => {
    underlyingByVault[vault.toLowerCase()] = underlying;
  });
  const vaults = Object.keys(underlyingByVault);
  if (!vaults.length) throw new Error("eva: no vaults registered on the mastermind");

  const skims = await options.getLogs({
    targets: vaults,
    eventAbi: abis.Skimmed,
    onlyArgs: false,
  });

  skims.forEach((log: any) => {
    dailyFees.add(underlyingByVault[log.address.toLowerCase()], log.args.amount, METRIC.ASSETS_YIELDS);
  });

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-03-24",
  methodology: {
    Fees: "Yield skimmed from eva vault backing after holder obligations are covered.",
    Revenue: "eva retains no protocol revenue from skimmed yield.",
    ProtocolRevenue: "eva retains no protocol revenue from skimmed yield.",
    SupplySideRevenue: "Skimmed yield is allocated back to users through LP incentives.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield skimmed from eva vault backing after holder obligations are covered.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Skimmed yield allocated back to users through LP incentives.",
    },
  },
};

export default adapter;
