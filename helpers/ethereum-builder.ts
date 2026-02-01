import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { queryIndexer } from "./indexer";
import { getETHReceived } from "./token";

const KnownValidatorsMevRecipients = [
  '0x388c818ca8b9251b393131c08a736a67ccb19297', // Lido MEW Vault
  '0x4675c7e5baafbffbca748158becba61ef3b0a263', // Coinbase MEW Builder
  '0xd6e4aa932147a3fe5311da1b67d9e73da06f9cef', // Mantle mETH
  '0x7d16d2c4e96bcfc8f815e15b771ac847ecbdb48b', // Liquid Collective
  '0xb3D9cf8E163bbc840195a97E81F8A34E295B8f39', // Swell

  '0x9FC3da866e7DF3a1c57adE1a97c9f00a70f010c8',
]

function getValidatorsFilter(): string {
  return KnownValidatorsMevRecipients.map(a => `'\\x${a.slice(2)}'`).join(',');
}

interface EthereumBlockBuilderExportOptions {
  builderAddress: string;
  start?: string;
}

export function ethereumBlockBuilderExport(exportOptions: EthereumBlockBuilderExportOptions) {
  const adapter: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.ETHEREUM],
    allowNegativeValue: true,
    start: exportOptions.start ? exportOptions.start : '2024-01-01',
    methodology: {
      Fees: 'Total transactions fees and MEW rewards collected by building blocks on Ethereum blockchain.',
      Revenue: 'Earning from total fees minus total priority rewards paid to validators.',
      ProtocolRevenue: 'Earning from total fees minus total priority rewards paid to validators.',
    },
    fetch: async (options: FetchOptions) => {
      const dailyFees = options.createBalances();

      const formattedBuilderAddress = exportOptions.builderAddress.slice(2);
      
      const fromTime = new Date(options.fromTimestamp * 1000).toISOString();
      const toTime = new Date(options.toTimestamp * 1000).toISOString();
      
      // count all block rewards = total transaction fees - total fees burnt
      const blocks = await queryIndexer(`
        SELECT number, total_fees, base_fee_per_gas * gas_used as total_fees_burnt
        FROM ethereum.blocks 
        WHERE
          miner = '\\x${formattedBuilderAddress}'
          AND time BETWEEN '${fromTime}' AND '${toTime}'
      `)
      
      const mewFees = await getETHReceived({ options: options, target: exportOptions.builderAddress })
      
      // count all ETH directly transfer from builder to validators + transaction fees
      // make sure to to_addresses are known validators addresses or transaction value < 1 ETH
      const fees = await queryIndexer(`
        SELECT
          SUM(value) AS total_fees_priority,
          SUM(fee) AS total_fees_transactions
        FROM ethereum.transactions
        WHERE
          from_address = '\\x${formattedBuilderAddress}'
          AND to_address != '\\x${formattedBuilderAddress}'
          AND block_time BETWEEN '${fromTime}' AND '${toTime}'
          AND (
            to_address IN (${getValidatorsFilter()})
            OR value < 1000000000000000000
          )
      `)
      
      const totalFees = options.createBalances();
      for (const block of blocks) {
        totalFees.addGasToken(BigInt((block as any).total_fees) - BigInt((block as any).total_fees_burnt))
      }

      const totalPriority = options.createBalances();
      totalPriority.addGasToken((fees as any)[0].total_fees_priority); // amount paid to validators
      totalPriority.addGasToken((fees as any)[0].total_fees_transactions); // transactions fees paid
      
      dailyFees.add(totalFees);
      dailyFees.add(mewFees);
      
      const dailyRevenue = dailyFees.clone(1);
      dailyRevenue.subtract(totalPriority);
      
      return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
      };
    },
  };
  
  return adapter;
}
