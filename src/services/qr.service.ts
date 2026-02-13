import axios from "axios";
import crypto from "crypto";
import { Collection, Db } from "mongodb";
import { config } from "../config/index.js";
import { assertHexLength, hexToBuffer } from "../utils/hex.js";
import type {
    GenerateQrInput,
    GenerateQrOutput,
    VerifyQrOutput,
} from "./qr.types.js";

/**
 * Service layer for protected QR generation and verification.
 */
export class QrService {
    /**
     * Collection for immutable generation audit records.
     */
    private readonly auditCollection: Collection;

    /**
     * Collection for verification events and confidence scores.
     */
    private readonly verifyCollection: Collection;

    /**
     * Create a new service with MongoDB dependencies.
     *
     * @param db - Mongo database handle.
     */
    constructor(private readonly db: Db) {
        // Use dedicated collections for auditability and verification history.
        this.auditCollection = db.collection("qr_audit");
        this.verifyCollection = db.collection("qr_verify_logs");
    }

    /**
     * Generate a fixed-geometry protected QR token and image.
     *
     * The payload is a strict 34-byte structure:
     *  - Timestamp (6 bytes)
     *  - DataHash (4 bytes)
     *  - Series (8 bytes)
     *  - Issued (8 bytes)
     *  - Expiry (8 bytes)
     */
    async generate(input: GenerateQrInput): Promise<GenerateQrOutput> {
        // Strict hex validation to preserve byte-accurate packing.
        assertHexLength("data_hash", input.data_hash, 8);
        assertHexLength("metadata_series", input.metadata_series, 16);
        assertHexLength("metadata_issued", input.metadata_issued, 16);
        assertHexLength("metadata_expiry", input.metadata_expiry, 16);

        // Timestamp is written as 6 bytes (uint48) to meet the fixed payload layout.
        const timestampMs = Date.now();
        const tsBuffer = Buffer.alloc(6);
        tsBuffer.writeUIntBE(timestampMs, 0, 6);

        // Pack the payload in the exact byte order required by the standard.
        const payloadBinary = Buffer.concat([
            tsBuffer,
            hexToBuffer(input.data_hash),
            hexToBuffer(input.metadata_series),
            hexToBuffer(input.metadata_issued),
            hexToBuffer(input.metadata_expiry),
        ]);

        // HMAC is truncated to 16 bytes (32 hex chars) for the fixed token length.
        const hmac = crypto
            .createHmac("sha256", config.hmacSecret)
            .update(payloadBinary)
            .digest("hex")
            .slice(0, 32);

        // URL-safe Base64 without padding ensures deterministic token length.
        const payloadB64 = payloadBinary
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");

        const token = `${payloadB64}.${hmac}`;

        // Delegate QR rendering to the Python core for deterministic geometry.
        const pythonRes = await axios.post(
            `${config.pythonServiceUrl}/generate-protected-qr`,
            {
                token,
                size: 600,
                border: 1,
            },
            { timeout: config.requestTimeoutMs },
        );

        const qrImageBase64 = pythonRes.data?.qr_image_base64;

        // Persist audit metadata for traceability and compliance.
        await this.auditCollection.insertOne({
            token,
            data_hash: input.data_hash,
            metadata_series: input.metadata_series,
            metadata_issued: input.metadata_issued,
            metadata_expiry: input.metadata_expiry,
            created_at: new Date(),
        });

        return {
            token,
            qr_image_base64: qrImageBase64,
        };
    }

    /**
     * Verify a QR image using the Python core and decode the embedded metadata.
     */
    async verify(imageBase64: string): Promise<VerifyQrOutput> {
        // Delegate verification to Python to keep geometry-specific logic centralized.
        const pythonRes = await axios.post(
            `${config.pythonServiceUrl}/verify-protected-qr`,
            { image_base64: imageBase64 },
            { timeout: config.requestTimeoutMs },
        );

        const { token, confidence_score, is_authentic } = pythonRes.data || {};
        const decodedMeta = token ? this.decodeToken(token) : null;

        // Store verification results for audit trails.
        await this.verifyCollection.insertOne({
            token: token ?? null,
            confidence_score: confidence_score ?? 0,
            is_authentic: Boolean(is_authentic),
            created_at: new Date(),
        });

        return {
            is_authentic: Boolean(is_authentic),
            confidence_score: confidence_score ?? 0,
            decoded_meta: decodedMeta,
        };
    }

    /**
     * Decode the Base64Url payload back into fixed-size metadata fields.
     * Returns null if the payload length is not exactly 34 bytes.
     */
    private decodeToken(token: string) {
        const [payloadB64] = token.split(".");
        // Base64Url decoding requires restoring standard Base64 characters.
        const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
        const padLength = (4 - (padded.length % 4)) % 4;
        // Padding is required for Buffer.from to decode correctly.
        const paddedB64 = padded + "=".repeat(padLength);
        const payload = Buffer.from(paddedB64, "base64");

        if (payload.length !== 34) {
            return null;
        }

        return {
            // Byte offsets must match the fixed payload layout.
            data_hash: payload.subarray(6, 10).toString("hex"),
            metadata_series: payload.subarray(10, 18).toString("hex"),
            metadata_issued: payload.subarray(18, 26).toString("hex"),
            metadata_expiry: payload.subarray(26, 34).toString("hex"),
        };
    }
}
