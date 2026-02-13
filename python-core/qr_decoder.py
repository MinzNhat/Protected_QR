"""
qr_decoder.py

Decode QR data and verify the copy-sensitive center pattern.
Verification is based on deterministic pattern regeneration from the token.
"""

import hashlib
import numpy as np
import cv2
from PIL import Image

try:
    from qr_center import generate_micro_qr_pil
except ImportError:
    from .qr_center import generate_micro_qr_pil


def decode_qr_data(image_bgr: np.ndarray) -> str:
    """
    Decode QR payload using OpenCV QRCodeDetector.

    Args:
        image_bgr: OpenCV BGR image containing a QR code.

    Returns:
        Decoded string payload or empty string if not found.
    """
    detector = cv2.QRCodeDetector()
    data, bbox, _ = detector.detectAndDecode(image_bgr)
    if not data:
        return ""
    return data


def extract_center_pattern(
    image_bgr: np.ndarray, expected_size_px: int = 154
) -> np.ndarray:
    """
    Extract the fixed-size center pattern from the QR region.

    The crop targets the QR center; if detection fails, the full image is
    treated as the region to keep behavior deterministic.

    Args:
        image_bgr: OpenCV BGR image containing a QR code.
        expected_size_px: Size of the square crop in pixels.

    Returns:
        Grayscale numpy array of the center pattern.
    """
    detector = cv2.QRCodeDetector()
    _, bbox, _ = detector.detectAndDecode(image_bgr)

    if bbox is not None and len(bbox) > 0:
        pts = bbox[0].astype(np.int32)
        x_min, y_min = pts.min(axis=0)
        x_max, y_max = pts.max(axis=0)
        padding = 5
        x_min = max(0, x_min - padding)
        y_min = max(0, y_min - padding)
        x_max = min(image_bgr.shape[1], x_max + padding)
        y_max = min(image_bgr.shape[0], y_max + padding)
        qr_region = image_bgr[y_min:y_max, x_min:x_max]
    else:
        qr_region = image_bgr

    # Convert to grayscale for stable thresholding and comparison.
    img_pil = Image.fromarray(cv2.cvtColor(qr_region, cv2.COLOR_BGR2RGB)).convert("L")
    w, h = img_pil.size
    cx, cy = w // 2, h // 2
    half = expected_size_px // 2

    x1 = max(0, cx - half)
    y1 = max(0, cy - half)
    x2 = min(w, cx + half)
    y2 = min(h, cy + half)

    box = img_pil.crop((x1, y1, x2, y2))
    # Keep nearest-neighbor resizing to preserve binary structure.
    if box.size != (expected_size_px, expected_size_px):
        box = box.resize((expected_size_px, expected_size_px), Image.Resampling.NEAREST)

    return np.array(box)


def verify_pattern_authenticity(
    pattern_array: np.ndarray, token: str, pattern_modules: int = 56
) -> dict:
    """
    Verify the center pattern by regenerating it from the token hash and
    computing binary match + correlation confidence.

    Args:
        pattern_array: Extracted grayscale pattern.
        token: Payload string encoded in the QR data.
        pattern_modules: Module count for the micro-pattern grid.

    Returns:
        Dict with authenticity decision, confidence score, and metrics.
    """
    sig_hex = hashlib.sha256(token.encode("utf-8")).hexdigest()
    pattern_size_px = pattern_array.shape[0]
    expected_pattern = generate_micro_qr_pil(
        sig_hex, pattern_size_px, modules=pattern_modules
    )
    expected_array = np.array(expected_pattern.convert("L"))

    expected_binary = (expected_array < 128).astype(np.uint8)
    actual_binary = (pattern_array < 128).astype(np.uint8)

    binary_match = (expected_binary == actual_binary).sum() / pattern_array.size

    if expected_binary.std() > 0 and actual_binary.std() > 0:
        binary_corr = np.corrcoef(expected_binary.flatten(), actual_binary.flatten())[
            0, 1
        ]
    else:
        binary_corr = 1.0 if binary_match > 0.99 else 0.0

    # Weight binary match higher than correlation to avoid scan noise bias.
    confidence = binary_match * 0.7 + binary_corr * 0.3
    is_authentic = confidence > 0.70
    is_photocopy = confidence < 0.55

    return {
        "is_authentic": bool(is_authentic),
        "confidence_score": float(confidence),
        "binary_match_ratio": float(binary_match),
        "binary_correlation": float(binary_corr),
        "is_photocopy": bool(is_photocopy),
    }
