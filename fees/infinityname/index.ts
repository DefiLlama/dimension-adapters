import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// InfinityName Contract addresses by chain
const INFINITYNAME_CONTRACTS: Record<string, string> = {
  [CHAIN.BASE]: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
  [CHAIN.OPTIMISM]: "0x160F10843389773986F44Db9B64e318c50b7fC7F",
  [CHAIN.BOB]: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
  [CHAIN.SONEIUM]: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
  [CHAIN.INK]: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
  [CHAIN.UNICHAIN]: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
};

// Event ABIs from InfinityName contract
const abi_event = {
  // Main fee collection event - emitted when registration fee is sent to feeRecipient
  registrationFeeCollected: "event RegistrationFeeCollected(address indexed recipient, uint256 amount)",
  // Domain registration event
  domainRegistered: "event DomainRegistered(address indexed owner, string domain, uint256 tokenId)",
  // Referral fee event
  referralPaid: "event ReferralPaid(address indexed referrer, uint256 amount, address indexed buyer)",
};

const methodology = {
  Fees: "Domain registration fees paid by users in native tokens (includes protocol fees + referral commissions)",
  Revenue: "Registration fees collected by the protocol's feeRecipient address",
};

const fetch = async (options: FetchOptions) => {
  const contractAddress = INFINITYNAME_CONTRACTS[options.chain];
  const dailyFees = options.createBalances();

  if (!contractAddress) {
    return { dailyFees, dailyRevenue: dailyFees };
  }

  try {
    // Get RegistrationFeeCollected events - this captures the actual fees sent to feeRecipient
    const feeCollectedLogs = await options.getLogs({
      target: contractAddress,
      eventAbi: abi_event.registrationFeeCollected,
    });

    // Process fee collection events
    feeCollectedLogs.forEach((log: any) => {
      if (log.amount) {
        dailyFees.addGasToken(log.amount);
      }
    });

    // Optionally track referral fees as part of total fees (these also come from user payments)
    const referralLogs = await options.getLogs({
      target: contractAddress,
      eventAbi: abi_event.referralPaid,
    });

    referralLogs.forEach((log: any) => {
      if (log.amount) {
        dailyFees.addGasToken(log.amount);
      }
    });
  } catch (e) {
    // Return empty balances if logs cannot be fetched
    console.error(`Error fetching logs for ${options.chain}:`, e);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2024-06-01', // Update with actual InfinityName launch date on Base
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2024-06-01', // Update with actual InfinityName launch date on Optimism
    },
    [CHAIN.BOB]: {
      fetch,
      start: '2024-08-01', // BOB mainnet launched mid 2024
    },
    [CHAIN.SONEIUM]: {
      fetch,
      start: '2025-01-14', // Soneium mainnet launched January 2025
    },
    [CHAIN.INK]: {
      fetch,
      start: '2024-12-18', // Ink mainnet launched December 2024
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: '2025-02-11', // Unichain mainnet launched February 2025
    },
  },
  methodology,
};

export default adapter;

