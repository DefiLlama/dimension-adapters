import { FetchOptions, SimpleAdapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { forEachKadenaBlock, kadenaNumber } from "../helpers/kadena";

const TRANSACTION_FEES = 'Transaction Fees';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // gas paid by the transactions of every block created inside the window, on all 20 chains
  let totalFees = 0;
  await forEachKadenaBlock(options, (block) => {
    const where = `chain ${block.chainId} block ${block.height}`;
    for (const { cmd, output } of block.transactions) {
      const gasPrice = kadenaNumber(cmd.meta.gasPrice, 'gasPrice', where);
      const gasUsed = kadenaNumber(output.gas, 'gas', where);
      totalFees += gasUsed * gasPrice;
    }
  });

  dailyFees.addCGToken('kadena', totalFees, TRANSACTION_FEES);

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: dailyFees.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.KADENA],
  start: '2019-12-05',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Gas paid by every transaction on the 20 Kadena chains (gas used x gas price, in KDA).',
    Revenue: 'None. Kadena does not burn gas fees or send them to a treasury.',
    HoldersRevenue: 'No gas fees are burned or distributed to KDA holders.',
    SupplySideRevenue: 'All gas fees are paid to the miner of the block. Block rewards are not fees and are excluded.',
  },
  breakdownMethodology: {
    Fees: {
      [TRANSACTION_FEES]: 'Gas used x gas price of every transaction, summed over the 20 chains',
    },
    SupplySideRevenue: {
      [TRANSACTION_FEES]: 'Gas fees paid to block miners',
    },
  },
};

export default adapter;
