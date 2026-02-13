/**
 * Standard HTTP exception carrying status code and optional details.
 */
export class HttpException extends Error {
    /**
     * HTTP status code for the error.
     */
    public readonly status: number;

    /**
     * Optional structured details for troubleshooting or validation.
     */
    public readonly details?: Record<string, unknown>;

    /**
     * Create a new HttpException.
     *
     * @param status - HTTP status code.
     * @param message - Human-readable error message.
     * @param details - Optional structured details.
     */
    constructor(
        status: number,
        message: string,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
