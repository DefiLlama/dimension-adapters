import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { queryAllium } from "./allium";
import { getETHReceived } from "./token";
import { METRIC } from "./metrics";

const KnownValidatorsMevRecipients = [
  '0x388c818ca8b9251b393131c08a736a67ccb19297', // Lido MEV Vault
  '0x4675c7e5baafbffbca748158becba61ef3b0a263', // Coinbase MEV Builder
  '0xd6e4aa932147a3fe5311da1b67d9e73da06f9cef', // Mantle mETH
  '0x7d16d2c4e96bcfc8f815e15b771ac847ecbdb48b', // Liquid Collective
  '0xb3D9cf8E163bbc840195a97E81F8A34E295B8f39', // Swell
]

// Titan pays proposers through these; they selfdestruct the ETH to the fee recipient given in calldata
const ProposerPaymentForwarders = [
  '0xfeeeeee44046c3f61a8cc081e0918ef0de0a7ffc', // Titan forwarder (single recipient)
  '0xfeeeeeeaea9b3ce71ce8a252aaa11d2dc439cc69', // Titan forwarder (multi recipient)
]

function getValidatorsFilter(): string {
  return [...KnownValidatorsMevRecipients, ...ProposerPaymentForwarders].map(a => `'${a.toLowerCase()}'`).join(',');
}

const BLOCK_BUILDING_PROFIT = 'Block Building Profit';
const PAYMENTS_TO_PROPOSERS = 'Payments To Block Proposers';

interface EthereumBlockBuilderExportOptions {
  builderAddress: string;
  start?: string;
}

export function ethereumBlockBuilderExport(exportOptions: EthereumBlockBuilderExportOptions) {
  const adapter: SimpleAdapter = {
    version: 2,
    //pullHourly: true,
    chains: [CHAIN.ETHEREUM],
    allowNegativeValue: true, // a builder can pay the proposer more than its block earned
    dependencies: [Dependencies.ALLIUM],
    start: exportOptions.start ? exportOptions.start : '2024-01-01',
    methodology: {
      Fees: 'Total transactions fees and MEV rewards collected by building blocks on Ethereum blockchain.',
      Revenue: 'Earning from total fees minus total priority rewards paid to validators.',
      ProtocolRevenue: 'Earning from total fees minus total priority rewards paid to validators.',
      SupplySideRevenue: 'ETH the builder pays block proposers for its blocks, plus the gas of those payment transactions.',
    },
    breakdownMethodology: {
      Fees: {
        [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees collected from building blocks on Ethereum (total fees minus base fees burnt)',
        [METRIC.MEV_REWARDS]: 'MEV (Maximum Extractable Value) rewards from direct ETH transfers received by the block builder',
      },
      Revenue: {
        [BLOCK_BUILDING_PROFIT]: 'Transaction fees and MEV rewards kept by the builder after its payments to block proposers and the gas spent on them',
      },
      SupplySideRevenue: {
        [PAYMENTS_TO_PROPOSERS]: 'ETH sent by the builder to known proposer fee recipients, through proposer payment forwarders, or in any transfer under 1 ETH, plus the gas of those transactions',
      },
    },
    fetch: async (options: FetchOptions) => {
      const dailyFees = options.createBalances();

      const builderAddress = exportOptions.builderAddress.toLowerCase();

      // count all block rewards = total transaction fees - total fees burnt,
      // computed as the sum of priority tips over transactions in the builder's blocks
      const [{ block_rewards }] = await queryAllium(`
        SELECT
          COALESCE(SUM((t.receipt_effective_gas_price - b.base_fee_per_gas) * t.receipt_gas_used), 0) AS block_rewards
        FROM ethereum.raw.transactions t
        JOIN ethereum.raw.blocks b ON t.block_number = b.number
        WHERE
          b.miner = '${builderAddress}'
          AND t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      `)

      const mevFees = await getETHReceived({ options: options, target: exportOptions.builderAddress })

      // builder payments to proposers (known fee recipients, forwarders, or any transfer < 1 ETH) + their gas
      const [fees] = await queryAllium(`
        SELECT
          COALESCE(SUM(CASE WHEN receipt_status = 1 THEN value ELSE 0 END), 0) AS total_fees_priority,
          COALESCE(SUM(receipt_gas_used * receipt_effective_gas_price), 0) AS total_fees_transactions
        FROM ethereum.raw.transactions
        WHERE
          from_address = '${builderAddress}'
          AND to_address != '${builderAddress}'
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND (
            to_address IN (${getValidatorsFilter()})
            OR value < 1000000000000000000
          )
      `)

      const dailySupplySideRevenue = options.createBalances();
      dailySupplySideRevenue.addGasToken(fees.total_fees_priority || 0, PAYMENTS_TO_PROPOSERS);
      dailySupplySideRevenue.addGasToken(fees.total_fees_transactions || 0, PAYMENTS_TO_PROPOSERS);

      dailyFees.addGasToken(block_rewards, METRIC.TRANSACTION_GAS_FEES);
      dailyFees.addBalances(mevFees, METRIC.MEV_REWARDS);

      const dailyRevenue = dailyFees.clone(1, BLOCK_BUILDING_PROFIT);
      dailyRevenue.subtract(dailySupplySideRevenue, BLOCK_BUILDING_PROFIT);

      return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
      };
    },
  };
  
  return adapter;
}

const builderProtocols: Record<string, SimpleAdapter> = {
  'beaverbuild': ethereumBlockBuilderExport({ builderAddress: '0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5' }),
  'titan-builder': ethereumBlockBuilderExport({ builderAddress: '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97' }),
  'shimmerblocks': ethereumBlockBuilderExport({ builderAddress: '0xa28b0ac939fc6baaadc79a94f425345c60463417', start: '2025-12-26' }),
  'quasar-builder': ethereumBlockBuilderExport({ builderAddress: '0x396343362be2A4dA1cE0C1C210945346fb82Aa49', start: '2025-01-10' }),
};

export const protocolList = Object.keys(builderProtocols);
export const getAdapter = (name: string) => builderProtocols[name];
