import { z } from "zod";

/**
 * Validation schema for the generate endpoint.
 * Enforces fixed-length hex strings to match the 34-byte payload layout.
 */
export const generateQrSchema = z.object({
    /**
     * Hex string (8 chars = 4 bytes).
     */
    data_hash: z.string().length(8),

    /**
     * Hex string (16 chars = 8 bytes).
     */
    metadata_series: z.string().length(16),

    /**
     * Hex string (16 chars = 8 bytes).
     */
    metadata_issued: z.string().length(16),

    /**
     * Hex string (16 chars = 8 bytes).
     */
    metadata_expiry: z.string().length(16),
});

/**
 * Type for validated generate request payloads.
 */
export type GenerateQrDto = z.infer<typeof generateQrSchema>;
