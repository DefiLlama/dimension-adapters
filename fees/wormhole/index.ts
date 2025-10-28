import {Adapter, Dependencies, FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {Balances} from "@defillama/sdk";
import {getSolanaReceived} from "../../helpers/token";
import {queryDuneSql} from "../../helpers/dune";

const evmFeeEvents = {
  standardRelayer: 'event SendEvent(uint64 indexed sequence, uint256 deliveryQuote, uint256 paymentForExtraReceiverValue)',
  executor: 'event RequestForExecution(address indexed quoterAddress, uint256 amtPaid, uint16 dstChain, bytes32 dstAddr, address refundAddr, bytes signedQuote, bytes requestBytes, bytes relayInstructions)',
}

// Source: https://wormhole.com/docs/products/reference/contract-addresses
const evmContracts: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x84EEe8dBa37C36947397E1E11251cA9A06Fc6F8a',
    startDate: '2023-06-16'
  },
  [CHAIN.ARBITRUM]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x3980f8318fc03d79033Bbb421A622CDF8d2Eeab4',
    startDate: '2023-06-16'
  },
  [CHAIN.AVAX]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x4661F0E629E4ba8D04Ee90080Aee079740B00381',
    startDate: '2023-06-16'
  },
  [CHAIN.BASE]: {
    standardRelayer: '0x706f82e9bb5b0813501714ab5974216704980e31',
    executor: '0x9E1936E91A4a5AE5A5F75fFc472D6cb8e93597ea',
    startDate: '2023-08-08'
  },
  [CHAIN.BERACHAIN]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x0Dd7a5a32311b8D87A615Cc7f079B632D3d5e2D3',
    startDate: '2025-03-04'
  },
  [CHAIN.BSC]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0xeC8cCCD058DbF28e5D002869Aa9aFa3992bf4ee0',
    startDate: '2023-06-16'
  },
  [CHAIN.CELO]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0xe6Ea5087c6860B94Cf098a403506262D8F28cF05',
    startDate: '2023-06-16'
  },
  [CHAIN.FANTOM]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: null,
    startDate: '2023-06-16'
  },
  [CHAIN.HYPERLIQUID]: {
    standardRelayer: null,
    executor: '0xd7717899cc4381033Bc200431286D0AC14265F78',
    startDate: '2025-06-02'
  },
  [CHAIN.INK]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x3e44a5F45cbD400acBEF534F51e616043B211Ddd',
    startDate: '2025-03-08'
  },
  [CHAIN.KLAYTN]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: null,
    startDate: '2023-06-17'
  },
  [CHAIN.LINEA]: {
    standardRelayer: null,
    executor: '0x23aF2B5296122544A9A7861da43405D5B15a9bD3',
    startDate: '2025-05-08'
  },
  [CHAIN.MANTLE]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: null,
    startDate: '2024-07-03'
  },
  [CHAIN.MEZO]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x0f9b8E144Cc5C5e7C0073829Afd30F26A50c5606',
    startDate: '2023-06-27'
  },
  [CHAIN.MOONBEAM]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x85D06449C78064c2E02d787e9DC71716786F8D19',
    startDate: '2023-06-16'
  },
  [CHAIN.OPTIMISM]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x85B704501f6AE718205C0636260768C4e72ac3e7',
    startDate: '2023-06-16'
  },
  [CHAIN.PLUME]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: null,
    startDate: '2025-07-18'
  },
  [CHAIN.POLYGON]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x0B23efA164aB3eD08e9a39AC7aD930Ff4F5A5e81',
    startDate: '2023-06-16'
  },
  [CHAIN.SCROLL]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0xcFAdDE24640e395F5A71456A825D0D7C3741F075',
    startDate: '2024-05-02'
  },
  [CHAIN.SONIC]: {
    standardRelayer: null,
    executor: '0x3Fdc36b4260Da38fBDba1125cCBD33DD0AC74812',
    startDate: '2025-05-08'
  },
  [CHAIN.UNICHAIN]: {
    standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
    executor: '0x764dD868eAdD27ce57BCB801E4ca4a193d231Aed',
    startDate: '2025-02-21'
  },
  [CHAIN.WC]: {
    standardRelayer: '0x1520cc9e779c56dab5866bebfb885c86840c33d3',
    executor: '0x8689b4E6226AdC8fa8FF80aCc3a60AcE31e8804B',
    startDate: '2024-11-13'
  },
  [CHAIN.XRPL_EVM]: {
    standardRelayer: null,
    executor: '0x8345E90Dcd92f5Cf2FAb0C8E2A56A5bc2c30d896',
    startDate: '2025-08-22'
  },
  
  // [CHAIN.CREDIT_COIN]: { // not available in defillama yet
  //   standardRelayer: null,
  //   executor: '0xd2e420188f17607Aa6344ee19c3e76Cf86CA7BDe',
  //   startDate: '2025-09-25'
  // },
  // [CHAIN.XLAYER]: {
  //   standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  //   executor: null,
  //   startDate: '2024-07-03'
  // },
  // [CHAIN.SEI]: {
  //   standardRelayer: '0x27428DD2d3DD32A4D7f7C497eAaa23130d894911',
  //   executor: '0x25f1c923fb7a5aefa5f0a2b419fc70f2368e66e5',
  //   startDate: '2025-05-23'
  // },
};

const fetchExecutorFees = async (options: FetchOptions, dailyFees: Balances): Promise<void> => {

  const feeEvents: Array<any> = await options.getLogs({
    target: evmContracts[options.chain].executor,
    eventAbi: evmFeeEvents.executor,
  })
  for (const event of feeEvents) {
    dailyFees.addGasToken(event.amtPaid)
  }
};

const fetchStandardRelayersFees = async (options: FetchOptions, dailyFees: Balances): Promise<void> => {

  const feeEvents: Array<any> = await options.getLogs({
    target: evmContracts[options.chain].standardRelayer,
    eventAbi: evmFeeEvents.standardRelayer,
  })
  for (const event of feeEvents) {
    dailyFees.addGasToken(event.deliveryQuote);
  }
};

const fetchEvm: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  // EVM fees are currently set at 0, it can be adjusted with gov in the future.

  const dailyFees = options.createBalances()

  if (evmContracts[options.chain]['standardRelayer'] != null) {
      await fetchStandardRelayersFees(options, dailyFees);
  }
  if (evmContracts[options.chain]['executor'] != null) {
    await fetchExecutorFees(options, dailyFees);
  }

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
};

interface IData {
  pda: string;
}
const fetchSolana: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const SOLANA_MSG_FEE_COLLECTOR = '9bFNrXNb2WTx8fMHXCheaZqkLZ3YCCaiqTftHxeintHy' // all type of wormhole messages fees goes here
  const SOLANA_EXECUTOR_FEE_COLLECTOR = 'HpGb3q9cpDmWP2HaFWM8uFGR96sGEUY5e2jDb4Kh6DPA' // NTN,WTT,CCTP executions

  const dailyFees = options.createBalances();

  await getSolanaReceived({
    options,
    targets: [
      SOLANA_MSG_FEE_COLLECTOR,
      SOLANA_EXECUTOR_FEE_COLLECTOR
    ],
    balances : dailyFees,
  })


  // query SOL spent to rent accounts created for postMessage,postVaa,verifySignature; happens only with legacy implementation
  // more info : https://wormhole.com/docs/products/messaging/concepts/solana-shim/#the-core-bridge-account-problem
  const data: IData[] = await queryDuneSql(options, `
      WITH base AS (
          SELECT
              CASE
                  WHEN bytearray_substring(data, 1, 1) = 0x01
                      AND CARDINALITY(account_arguments) >= 2 THEN account_arguments[2]
                  WHEN bytearray_substring(data, 1, 1) = 0x02
                      AND CARDINALITY(account_arguments) >= 4 THEN account_arguments[4]
                  ELSE NULL
                  END AS pda
          FROM solana.instruction_calls
          WHERE
              executing_account = 'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth'
            AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
            AND block_time < FROM_UNIXTIME(${options.endTimestamp})
            AND length(data) >= 1
            AND (
              bytearray_substring(data, 1, 1) = 0x01
                  OR bytearray_substring(data, 1, 1) = 0x02
              )
      )
      SELECT DISTINCT pda
      FROM base
      WHERE pda IS NOT NULL
  `);

  const chunkSize = 1000;

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize)
    await getSolanaReceived({
      options,
      targets: chunk.map(item => item.pda),
      balances : dailyFees,
    })
  }

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
};


const adapters: Adapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  adapter: Object.keys(evmContracts).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetchEvm,
        start: evmContracts[chain].startDate,
      }
    }
  }, {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2022-07-08',
    }
    // TODO: Track Sui & Aptos
  }),
  methodology: {
    Fees: 'Total fees paid by users or Protocols for using Wormhole Relayers, Executions, CCTP and Cross chain message fees.',
    Revenue: 'Wormhole makes no revenue.',
    SupplySideRevenue: 'All execution fees are collected by Relayers.',
  }
};

export default adapters;
