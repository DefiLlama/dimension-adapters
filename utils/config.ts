import { fetchURL } from ".";
import { ChainObject, Protocol } from "./protocols/types";

type chain = {
  [k: string]: ChainObject;
};

export interface IConfig {
  protocols: Protocol[];
  chainCoingeckoIds: chain;
};

export const fetchConfig = async () => {
  const url = 'https://api.llama.fi/config';
  const data: IConfig = (await fetchURL(url))?.data;
  return data;
};
