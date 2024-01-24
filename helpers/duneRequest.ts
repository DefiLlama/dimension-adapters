import retry from "async-retry";
import fetchURL from "../utils/fetchURL";

const API_KEYS = process.env.DUNE_API_KEYS?.split(",") ?? [];
type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchURLWithRetry(url: string) {
  if (!requests[url])
    requests[url] = _fetchURLWithRetry(url)
  return requests[url]
}

async function _fetchURLWithRetry(url: string): Promise<any> {
  let API_KEY_INDEX = 0;

  return await retry(
    async (bail, _attempt: number) => {
      const api_key = API_KEYS[API_KEY_INDEX];
      try {
        const response = await fetchURL(`${url}?api_key=${api_key}`);
        return response;
      } catch (error: any) {
        console.log("Failed to fetch url", `${url}?api_key=${api_key}`);
        if (API_KEY_INDEX < API_KEYS.length - 1) {
          API_KEY_INDEX++;
        } else {
          const errorMessage = "All API keys failed";
          console.log(errorMessage);
          bail(new Error(errorMessage));
        }
        throw error;
      }
    },
    {
      retries: 20,
      factor: 1,
    }
  );
}
