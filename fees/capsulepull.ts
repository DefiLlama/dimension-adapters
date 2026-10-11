import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

const LEND = "0xa7F89DE1FE71Aa4D37A9179231787b2aC1a4DcFc";
const USDG = ADDRESSES.robinhood.USDG;

const FUNDED = "event Funded(bytes32 indexed id, address indexed funder, address indexed payer, uint64 expiresAt)";
const REPAID = "event Repaid(bytes32 indexed id, address indexed payer, uint256 toFunder, uint256 toProtocol)";
const DEAL = "function deal(bytes32 id) view returns (address owner, address funder, uint256 principal, uint256 funderFee, uint256 protocolFee, uint256 held, uint64 fundedAt, uint64 expiresAt, uint32 term, uint8 status)";

type Deal = {
  principal: bigint | string;
  funderFee: bigint | string;
  protocolFee: bigint | string;
  2?: bigint | string;
  3?: bigint | string;
  4?: bigint | string;
};

function field(deal: Deal, name: "principal" | "funderFee" | "protocolFee", index: 2 | 3 | 4) {
  return deal[name] ?? deal[index] ?? 0;
}

async function dealsFor(options: FetchOptions, logs: Array<{ id?: string; args?: { id?: string } }>) {
  const ids = logs.map((log) => log.id ?? log.args?.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return [];
  return options.api.multiCall({
    abi: DEAL,
    calls: ids.map((id) => ({ target: LEND, params: [id] })),
  }) as Promise<Deal[]>;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const funded = await dealsFor(options, await options.getLogs({ target: LEND, eventAbi: FUNDED }));
  for (const deal of funded) dailyVolume.add(USDG, field(deal, "principal", 2));

  const repaid = await dealsFor(options, await options.getLogs({ target: LEND, eventAbi: REPAID }));
  for (const deal of repaid) {
    const funderFee = field(deal, "funderFee", 3);
    const protocolFee = field(deal, "protocolFee", 4);
    dailySupplySideRevenue.add(USDG, funderFee, "Borrow Interest To Funders");
    dailyProtocolRevenue.add(USDG, protocolFee, "Borrow Interest To Protocol");
    dailyFees.add(USDG, funderFee, METRIC.BORROW_INTEREST);
    dailyFees.add(USDG, protocolFee, METRIC.BORROW_INTEREST);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "USDG principal deposited into CapsuleLend when a card loan is funded.",
  Fees: "On repayment, 3% of principal is paid to the funder and 1% of principal is paid to the protocol. The principal returned to the funder is not a fee.",
  UserFees: "The 4% paid by the owner who repays the loan.",
  Revenue: "The 1% protocol fee paid to the protocol address on repayment.",
  ProtocolRevenue: "The 1% protocol fee paid to the protocol address on repayment.",
  SupplySideRevenue: "The 3% paid to the funder when the owner repays.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "The 4% of principal paid when a card loan is repaid: 3% to the funder and 1% to the protocol.",
  },
  UserFees: {
    [METRIC.BORROW_INTEREST]: "The 4% of principal paid by the owner who repays the loan.",
  },
  Revenue: {
    "Borrow Interest To Protocol": "The 1% of principal paid to the protocol address on repayment.",
  },
  ProtocolRevenue: {
    "Borrow Interest To Protocol": "The 1% of principal paid to the protocol address on repayment.",
  },
  SupplySideRevenue: {
    "Borrow Interest To Funders": "The 3% of principal paid to the funder when the owner repays.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-10",
  methodology,
  breakdownMethodology,
};

export default adapter;
