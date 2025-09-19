import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { postURL } from "../../utils/fetchURL";

export const STREAMFLOW_TREASURY_SOLANA = "5SEpbdjFK5FxwTvfsGMXVQTD2v4M2c5tyRTxhdsPkgDw";   
export const STREAMFLOW_TREASURY_SUI = "0x2834d0d631b56f59ad2a37af3b7fa4d2c067781065bcd6623c682de690af59b9";


const solanaFetch: any = async (options: FetchOptions) => {
    const dailyFees = await getSolanaReceived({
        target: STREAMFLOW_TREASURY_SOLANA,
        options,
        // exclude swap transactions
        blacklist_signers: [STREAMFLOW_TREASURY_SOLANA],
    })

    return { dailyFees, dailyRevenue: dailyFees }
}

const suiFetch = async (options: FetchOptions) => {
    const fromTimestamp = options.fromTimestamp;
    const toTimestamp = options.toTimestamp;
    let cursor = null;
    let hasNextPage = true;
    let stopFetching = false;
    const dailyFees = options.createBalances();
    let total = 0;
  
    while (hasNextPage && !stopFetching) {
      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "suix_queryTransactionBlocks",
        params: [
          {
            filter: { ToAddress: STREAMFLOW_TREASURY_SUI },
            options: {
              showInput: true,
              showEffects: true,
              showEvents: true,
              showBalanceChanges: true,
            },
          },
          cursor,
          100,
          true,
        ],
      };
  
      const data = await postURL("https://fullnode.mainnet.sui.io:443", body);
  
      if (data.result && data.result.data) {
        for (const tx of data.result.data) {
          const ts = Number(tx.timestampMs) / 1000;
          if (ts < fromTimestamp) {
            stopFetching = true;
            break;
          }
          if (ts > toTimestamp) continue;
  
          if (tx.balanceChanges) {
            for (const change of tx.balanceChanges) {
              if (
                change.owner?.AddressOwner === STREAMFLOW_TREASURY_SUI &&
                Number(change.amount) > 0
              ) {
                total += Number(change.amount);
                dailyFees.add(change.coinType, Number(change.amount));
              }
            }
          }
        }
        hasNextPage = data.result.hasNextPage;
        cursor = data.result.nextCursor;
      } else {
        hasNextPage = false;
      }
    }
    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  };
    

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "All fees paid by users to use a particular Streamflow product.",
        Revenue: "All fees collected by the Streamflow protocol, a portion of which goes towards $STREAM buybacks and distribution to stakers",
    },
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: solanaFetch,
            start: '2023-01-05',
        },
        [CHAIN.SUI]: {
            fetch: suiFetch,
            start: '2025-02-03',
        },
    },
}

export default adapter;