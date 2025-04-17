import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryFlipside } from "../../helpers/flipsidecrypto";
import { queryIndexer } from "../../helpers/indexer";

const AUCTIONRESOLVED_EVENT_ABI =  'event AuctionResolved(bool indexed isMultiBidAuction, uint64 round, address indexed firstPriceBidder, address indexed firstPriceExpressLaneController, uint256 firstPriceAmount, uint256 price, uint64 roundStartTimestamp, uint64 roundEndTimestamp)'

const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async (options: FetchOptions) => {
        const { getFromBlock, getToBlock, createBalances, } = options
        const startblock = await getFromBlock()
        const endblock = await getToBlock()
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const timeboostFees = createBalances();

        const sequencerGas = `
            SELECT
              sum(ethereum.transactions.gas_used*ethereum.transactions.gas_price) as sum
            FROM ethereum.transactions
            INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
            WHERE ( to_address = '\\x1c479675ad559dc151f6ec7ed3fbf8cee79582b6'::bytea -- Current inbox
            OR to_address = '\\x4c6f947Ae67F572afa4ae0730947DE7C874F95Ef'::bytea -- Arbitrum: Sequencer Inbox
            OR to_address = '\\x51de512aa5dfb02143a91c6f772261623ae64564'::bytea -- Arbitrum: Validator1
            ) AND (block_time BETWEEN llama_replace_date_range);
          `
        // const seqGas: number = sequencerGas[0].sum
        const seqGas: any = await queryIndexer(sequencerGas, options)
        const feeQuery = await queryFlipside(`SELECT SUM(TX_FEE) from arbitrum.core.fact_transactions where BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}`, 260)
        const fees = Number(feeQuery[0][0])

        const logs = await options.getLogs({
          target: '0x5fcb496a31b7ae91e7c9078ec662bd7a55cd3079',
          eventAbi: AUCTIONRESOLVED_EVENT_ABI,
          parseLog: true,
        });

        logs.map((log:any) => {
          timeboostFees.add(WETH_ADDRESS, log.price);
        });

        dailyFees.addGasToken(fees * 1e18)
        dailyRevenue.addGasToken(seqGas[0].sum * -1)
        dailyRevenue.addGasToken(fees * 1e18)
        dailyFees.addBalances(timeboostFees);
        dailyRevenue.addBalances(timeboostFees);

        return { dailyFees, dailyRevenue, dailyProtocolRevenue: timeboostFees};

      }) as any,
      start: '2021-08-10',
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  version: 2
}

export default adapter;
