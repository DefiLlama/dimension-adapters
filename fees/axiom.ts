import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getSolanaReceived } from '../helpers/token';

const fetch: any = async (options: FetchOptions) => {
  const targets = [
    "7oi1L8U9MRu5zDz5syFahsiLUric47LzvJBQX6r827ws",
    "9kPrgLggBJ69tx1czYAbp7fezuUmL337BsqQTKETUEhP",
    "DKyUs1xXMDy8Z11zNsLnUg3dy9HZf6hYZidB6WodcaGy",
    "4FobGn5ZWYquoJkxMzh2VUAWvV36xMgxQ3M7uG1pGGhd",
    "76sxKrPtgoJHDJvxwFHqb3cAXWfRHFLe3VpKcLCAHSEf",
    "H2cDR3EkJjtTKDQKk8SJS48du9mhsdzQhy8xJx5UMqQK",
    "8m5GkL7nVy95G4YVUbs79z873oVKqg2afgKRmqxsiiRm",
    "4kuG6NsAFJNwqEkac8GFDMMheCGKUPEbaRVHHyFHSwWz",
    "8vFGAKdwpn4hk7kc1cBgfWZzpyW3MEMDATDzVZhddeQb",
    "86Vh4XGLW2b6nvWbRyDs4ScgMXbuvRCHT7WbUT3RFxKG",
    "DZfEurFKFtSbdWZsKSDTqpqsQgvXxmESpvRtXkAdgLwM",
    "5L2QKqDn5ukJSWGyqR4RPvFvwnBabKWqAqMzH4heaQNB",
    "DYVeNgXGLAhZdeLMMYnCw1nPnMxkBN7fJnNpHmizTrrF",
    "Hbj6XdxX6eV4nfbYTseysibp4zZJtVRRPn2J3BhGRuK9",
    "846ah7iBSu9ApuCyEhA5xpnjHHX7d4QJKetWLbwzmJZ8",
    "5BqYhuD4q1YD3DMAYkc1FeTu9vqQVYYdfBAmkZjamyZg", 
  ];


  const dailyFees = await getSolanaReceived({
    blacklists: targets,
    options,
    targets,
  });
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      meta: {
        methodology: {
          Fees: 'User pays 0.75%-1% fee on each trade',
        }
      }
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
