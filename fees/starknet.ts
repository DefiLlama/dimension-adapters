import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async (options: FetchOptions) => {
        const { createBalances } = options;
        const dailyFees = createBalances();

        const sequencerGas = `
            SELECT
              sum(ethereum.transactions.gas_used*ethereum.transactions.gas_price) as sum
            FROM ethereum.transactions
            INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
            WHERE ( to_address = '\\xc662c410C0ECf747543f5bA90660f6ABeBD9C8c4'::bytea -- Core
            OR to_address = '\\x47312450B3Ac8b5b8e247a6bB6d523e7605bDb60'::bytea -- Verifier
            ) AND (block_time BETWEEN llama_replace_date_range);
          `;

        const seqGas: any = await queryIndexer(sequencerGas, options);
        dailyFees.addGasToken(seqGas[0].sum);

        return { dailyFees };
      },
      start: "2022-01-01",
    },
  },
  protocolType: ProtocolType.CHAIN,
  version: 2,
};

export default adapter;
