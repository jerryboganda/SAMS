import { CONFIG } from "../../config";
import { apiFetch, mockLatency, ApiError } from "../client";
import { Coupon } from "../../types";
import { MOCK_COUPONS } from "../../mock-data";

export const couponsApi = {
  async validateCoupon(code: string, courseId?: number): Promise<Coupon> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const coupon = MOCK_COUPONS.find(
        (c) => c.code.toUpperCase() === code.trim().toUpperCase() && c.isActive
      );
      if (!coupon) {
        throw new ApiError("COUPON_INVALID", "Invalid or expired promo code.");
      }
      return coupon;
    }
    return apiFetch<Coupon>(`/coupons/validate`, {
      method: "POST",
      body: JSON.stringify({ code, courseId }),
    });
  },
};
