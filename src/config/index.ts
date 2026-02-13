import dotenv from "dotenv";

// Load environment variables from .env when present.
dotenv.config();

/**
 * Read a required environment variable and throw if missing.
 *
 * @param key - Environment variable name.
 * @param fallback - Optional fallback value.
 * @returns Resolved value.
 */
const required = (key: string, fallback?: string) => {
    const value = process.env[key] ?? fallback;
    if (!value) {
        throw new Error(`Missing required env: ${key}`);
    }
    return value;
};

/**
 * Runtime configuration for the API service.
 */
export const config = {
    /**
     * HTTP port for the Node.js API.
     */
    port: Number(process.env.PORT ?? 8080),

    /**
     * MongoDB connection string.
     */
    mongoUri: required("MONGO_URI"),

    /**
     * MongoDB database name.
     */
    mongoDb: required("MONGO_DB", "protected_qr"),

    /**
     * Base URL for the Python core service.
     */
    pythonServiceUrl: required("PYTHON_SERVICE_URL"),

    /**
     * HMAC secret used to sign payloads.
     */
    hmacSecret: required("HMAC_SECRET"),

    /**
     * Log level for structured logging.
     */
    logLevel: process.env.LOG_LEVEL ?? "info",

    /**
     * HTTP timeout for inter-service calls.
     */
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10000),
};
