import { FeeAdapter } from "../../../src/adapters.type";

export default async (folderName: string): Promise<FeeAdapter> => (await import(`../../../src/adapters/${folderName}`)).default