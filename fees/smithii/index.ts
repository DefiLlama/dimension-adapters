import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const solanaFetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: "5KgfWjGePnbFgDAuCqxB5oymuFxQskvCtrw6eYfDa7fj",
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

export const PaymentContracts: { [key: string]: string } = {
  [CHAIN.ETHEREUM]: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
  [CHAIN.BASE]: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
  [CHAIN.POLYGON]: "0x1272CA4D562b6eeFD7bfEfA64EFD9b93AC8d34D5",
  [CHAIN.ARBITRUM]: "0x6120fA4b79AB3672322EE5bA8eD59d4303D0ff06",
  [CHAIN.AVAX]: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
  [CHAIN.BSC]: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
  [CHAIN.BLAST]: "0x6120fA4b79AB3672322EE5bA8eD59d4303D0ff06",
};

export const PaymentContractsStartDates: { [key: string]: string } = {
  [CHAIN.ETHEREUM]: "2024-07-26",
  [CHAIN.BASE]: "2024-07-26",
  [CHAIN.POLYGON]: "2024-09-13",
  [CHAIN.ARBITRUM]: "2024-09-13",
  [CHAIN.AVAX]: "2024-09-13",
  [CHAIN.BSC]: "2024-09-13",
  [CHAIN.BLAST]: "2024-10-14",
};

const ServicePaidEvent =
  "event ServicePaid (bytes32 projectId, address contractAddress, bytes32 serviceId, address user, uint256 amount, uint256 timestamp)";

const evmFetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const data: Array<any> = await options.getLogs({
    target: PaymentContracts[options.chain],
    eventAbi: ServicePaidEvent,
  });
  data.forEach((log: any) => {
    dailyFees.addGasToken(log.amount);
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...Object.keys(PaymentContracts).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: evmFetch,
          start: PaymentContractsStartDates[chain],
          meta: {
            methodology: {
              Fees: "All fees paid by users to use a particular Smithii tool.",
              Revenue: "All fees are collected by smithii.io protocol.",
              ProtocolRevenue:
                "Trading fees are collected by smithii.io protocol.",
            },
          },
        },
      };
    }, {}),
    [CHAIN.SOLANA]: {
      fetch: solanaFetch,
      meta: {
        methodology: {
          Fees: "All fees paid by users to use a particular Smithii tool.",
          Revenue: "All fees are collected by smithii.io protocol.",
          ProtocolRevenue: "Trading fees are collected by smithii.io protocol.",
        },
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
