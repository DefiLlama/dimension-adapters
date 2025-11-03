import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const CONTRACTS: Record<string, string> = {
  [CHAIN.OPTIMISM]: "0x7314af7d05e054e96c44d7923e68d66475ffaab8",
  [CHAIN.ETHEREUM]: "0xd1fdf0144be118c30a53e1d08cc1e61d600e508e",
  [CHAIN.ARBITRUM]: "0x02c282f60fb2f3299458c2b85eb7e303b25fc6f0",
  [CHAIN.POLYGON]: "0x03f490ae5b59e428e6692059d0dca1b87ed42ae1",
};

const fetch = async (options: FetchOptions) => {
  const contract = CONTRACTS[options.chain];
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Get KROM token address and protocol fee percentage
  const [kromToken, protocolFeeRaw] = await Promise.all([
    options.api.call({ target: contract, abi: "function KROM() view returns (address)" }),
    options.api.call({ target: contract, abi: "function protocolFee() view returns (uint32)" }),
  ]);

  // Fetch LimitOrderProcessed events to get service fees paid in KROM
  const logs = await options.getLogs({
    target: contract,
    eventAbi: "event LimitOrderProcessed(address indexed monitor, uint256 indexed tokenId, uint256 serviceFeePaid)",
  });

  const PROTOCOL_FEE_BASE = 100000n;
  const protocolFee = BigInt(protocolFeeRaw);

  logs.forEach((log: any) => {
    const serviceFee = BigInt(log.serviceFeePaid || log[2] || 0);
    if (serviceFee === 0n) return;

    // Split: monitor gets base share, protocol gets remainder  
    const monitorShare = serviceFee * PROTOCOL_FEE_BASE / (PROTOCOL_FEE_BASE + protocolFee);
    const protocolShare = serviceFee - monitorShare;

    dailyFees.add(kromToken, serviceFee.toString());
    dailySupplySideRevenue.add(kromToken, monitorShare.toString());
    dailyProtocolRevenue.add(kromToken, protocolShare.toString());
  });

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2022-08-01",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2022-01-01",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2022-08-01",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2022-08-01",
    },
  },
  methodology: {
    Fees: "Sum of KROM service fees emitted by LimitOrderManager when limit orders execute (LimitOrderProcessed events).",
    Revenue: "Portion of fees forwarded to the protocol fee address.",
    ProtocolRevenue: "Service fees minus the monitor reimbursement share.",
    SupplySideRevenue: "Share of service fees paid to execution monitors for covering gas costs.",
  }
};

export default adapter;