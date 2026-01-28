import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium"; // Change this import

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const eventDiscriminatorHex = "c8e8a69ea07ffa2b";

  // Allium uses standard SQL.
  // Note: Allium table names for Solana are slightly different.
  const query = `
    SELECT 
      data
    FROM solana.instructions
    WHERE program_id = '9WUyNREiPDMgwMh5Gt81Fd3JpiCKxpjZ5Dpq9Bo1RhMV'
      AND block_timestamp BETWEEN '{{fromDate}}' AND '{{toDate}}'
      AND starts_with(data, '${eventDiscriminatorHex}')
  `;

  // Use queryAllium instead of queryIndexer
  const logs = await queryAllium(query, options);

  logs.forEach((log: any) => {
    const dataBuffer = Buffer.from(log.data, "hex");
    const amount = dataBuffer.readBigUInt64LE(12);
    dailyFees.add(
      "3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7",
      amount.toString(),
    );
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-01-01",
    },
  },
};

export default adapter;
