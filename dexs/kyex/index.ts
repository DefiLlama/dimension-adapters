import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import { getPrices } from "../../utils/prices"; // Import the getPrices function

const graphUrl = 'https://api.goldsky.com/api/public/project_cm2oa2774sg3y01uq8qw2cfhz/subgraphs/KYEXSwapEVM-zetachain-mainnet/1.0.0/gn';

interface SwapEvent {
  amountIn: string;
  amountOut: string;
  id: string;
  recipient: string;
  sender: string;
  timestamp_: string;
  tokenIn: string;
  tokenOut: string;
  transactionHash_: string;
}

interface GraphResponse {
  swapExecuteds: SwapEvent[];
}
const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances } = options; //Destructuring
  const dailyVolume = createBalances(); // Create Balances Object
  let lastId: string | undefined = undefined;

  do {
    const graphQuery = gql`
      query MyQuery($startTime: Int!, $endTime: Int!, $lastId: String) {
        swapExecuteds(
          first: 1000
          orderBy: id
          orderDirection: desc
          where: {
            timestamp__gte: $startTime
            timestamp__lt: $endTime
            ${lastId ? `id_lt: $lastId` : ""}
          }
        ) {
          amountIn
          amountOut
          id
          recipient
          sender
          timestamp_
          tokenIn
          tokenOut
          transactionHash_
        }
      }
    `;

    try {
      const variables = {
        startTime: startTimestamp,
        endTime: endTimestamp,
        lastId,
      };

      const { swapExecuteds }: GraphResponse = await request(graphUrl, graphQuery, variables);

      // --- Get Token Prices ---
      const tokens = swapExecuteds.reduce((acc: string[], event) => {
        if (!acc.includes(event.tokenIn.toLowerCase())) {
          acc.push(event.tokenIn.toLowerCase());
        }
        if (!acc.includes(event.tokenOut.toLowerCase())) {
          acc.push(event.tokenOut.toLowerCase());
        }
        return acc;
      }, []);

       //Batch price call.  Reduce external price API calls.
      const prices = await getPrices([
            ...tokens.map((address) => `${CHAIN.ZETA}:${address.toLowerCase()}`),
        ], endTimestamp);


      for (const event of swapExecuteds) {
        const tokenInPrice = prices[`${CHAIN.ZETA}:${event.tokenIn.toLowerCase()}`]?.price;
        // const tokenOutPrice = prices[`${CHAIN.ZETA}:${event.tokenOut.toLowerCase()}`]?.price;

        if (tokenInPrice) {
          dailyVolume.add(event.tokenIn.toLowerCase(), Number(event.amountIn) * tokenInPrice);
        } else {
            console.warn(`Price not found for token ${event.tokenIn} at timestamp ${endTimestamp}`);
        }
        // if(tokenOutPrice) {
        //   dailyVolume.add(event.tokenOut.toLowerCase(), Number(event.amountOut) * tokenOutPrice);
        // } else {
        //     console.warn(`Price not found for token ${event.tokenOut} at timestamp ${endTimestamp}`);
        // }
        lastId = event.id;
      }

      if (swapExecuteds.length < 1000) {
        lastId = undefined; // Exit loop if we have all data
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      throw error; // Re-throw the error to be handled by DefiLlama
    }
  } while (lastId);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ZETA]: {
      fetch,
      start: '2025-02-02',
    },
  },
};

export default adapter;