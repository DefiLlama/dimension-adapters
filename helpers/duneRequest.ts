import retry from "async-retry";
import fetchURL from "../utils/fetchURL";
import { getEnv } from "./env";

const API_KEYS = getEnv('DUNE_API_KEYS')?.split(",") ?? [];
type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchURLWithRetry(url: string) {
  /* const error = new Error("Dune: queryId is required")
  delete error.stack
  throw error */
  if (!requests[url])
    requests[url] = _fetchURLWithRetry(url)
  return requests[url]
}

async function _fetchURLWithRetry(url: string): Promise<any> {
  let API_KEY_INDEX = 0;

  return await retry(
    async (bail, _attempt: number) => {
      const api_key = API_KEYS[API_KEY_INDEX] ?? ''
      try {
        const response = await fetchURL(`${url}?api_key=${api_key}`);
        return response;
      } catch (error: any) {
        console.log("Dune: Failed to fetch url", `${url}?api_key=${api_key}`);
        if (API_KEY_INDEX < API_KEYS.length - 1) {
          API_KEY_INDEX++;
        } else {
          const errorMessage = "Dune: All API keys failed";
          // console.log(errorMessage);
          bail(new Error(errorMessage));
        }
        delete error.stack;
        throw error;
      }
    },
    {
      retries: 3 + API_KEYS.length * 2,
      factor: 1,
    }
  );
}
