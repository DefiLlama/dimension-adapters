import { FeeAdapter } from "../../../adapters.type";

export default async (folderName: string): Promise<FeeAdapter> => (await import(`../../../fees/${folderName}`)).default