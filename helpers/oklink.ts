import { getEnv } from "./env";

export async function getOklinkApiKey(): Promise<string> {
  const API_KEY = getEnv('OKLINK_API_KEY');
  if (!API_KEY) throw Error('Missing env OKLINK_API_KEY');
  const s = 1111111111111;
  const rotated = `${API_KEY.slice(8)}${API_KEY.slice(0, 8)}`;
  const now = Date.now();
  const time = `${(now + s).toString()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  return Buffer.from(`${rotated}|${time}`).toString('base64');
}
