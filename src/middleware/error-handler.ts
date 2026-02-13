import { NextFunction, Request, Response } from "express";
import { HttpException } from "../utils/http-exception.js";
import { logger } from "../utils/logger.js";

/**
 * Centralized error handler that normalizes API errors.
 *
 * @param err - Error object thrown in request handling.
 * @param _req - Express request (unused).
 * @param res - Express response.
 * @param _next - Express next function (unused).
 * @returns JSON error response.
 */
export const errorHandler = (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
) => {
    if (err instanceof HttpException) {
        logger.warn({
            message: err.message,
            details: err.details,
            status: err.status,
        });
        return res.status(err.status).json({
            success: false,
            error: {
                message: err.message,
                details: err.details,
            },
        });
    }

    const message =
        err instanceof Error ? err.message : "Internal server error";
    logger.error({ message, err });
    return res.status(500).json({
        success: false,
        error: {
            message,
        },
    });
};
