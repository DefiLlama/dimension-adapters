import { FeeAdapter } from "../../../src/utils/adapters.type";

export default async (folderName: string): Promise<FeeAdapter> => (await import(`../../../src/adapters/${folderName}`)).default