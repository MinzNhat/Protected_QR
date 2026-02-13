import { Request, Response } from "express";
import { Db } from "mongodb";
import { generateQrSchema } from "../dtos/qr.dto.js";
import { QrService } from "../services/qr.service.js";
import type { GenerateQrOutput } from "../services/qr.types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { HttpException } from "../utils/http-exception.js";
import type { ApiSuccess } from "../utils/response.js";

/**
 * Build the QR controller with database-backed service.
 *
 * @param db - Mongo database handle.
 * @returns Controller with generate and verify handlers.
 */
export const createQrController = (db: Db) => {
    const service = new QrService(db);

    /**
     * POST /api/v1/qr/generate
     *
     * Validates hex inputs, generates the fixed-geometry token, and returns
     * a Base64-encoded PNG produced by the Python core.
     */
    const generate = asyncHandler(
        async (req: Request, res: Response<ApiSuccess<GenerateQrOutput>>) => {
            const parsed = generateQrSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new HttpException(400, "Invalid request body", {
                    errors: parsed.error.flatten(),
                });
            }

            const data = await service.generate(parsed.data);
            return res.status(200).json({ success: true, data });
        },
    );

    /**
     * POST /api/v1/qr/verify
     *
     * Verifies the QR image by delegating to the Python core and returns
     * authenticity and decoded metadata (if available).
     */
    const verify = asyncHandler(async (req: Request, res: Response) => {
        if (!req.file) {
            throw new HttpException(400, "Image file is required");
        }

        // Base64 is used for cross-service portability without filesystem IO.
        const imageBase64 = req.file.buffer.toString("base64");
        const data = await service.verify(imageBase64);
        return res.status(200).json({
            is_authentic: data.is_authentic,
            confidence_score: data.confidence_score,
            decoded_meta: data.decoded_meta,
        });
    });

    return { generate, verify };
};
