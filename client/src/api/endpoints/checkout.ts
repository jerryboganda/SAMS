import { CONFIG } from "../../config";
import { apiFetch, apiUpload, mockLatency, ApiError } from "../client";
import { Order, PaymentGateway } from "../../types";
import { MOCK_COURSES, MOCK_COUPONS, MOCK_ORDERS } from "../../mock-data";

export interface GatewayInfo {
  code: PaymentGateway;
  name: string;
  enabled: boolean;
}

export interface QuoteRequest {
  courseId: number;
  couponCode?: string;
}

export interface QuoteResponse {
  courseId: number;
  originalPrice: number;
  discountAmount: number;
  finalAmount: number;
  couponCode?: string;
  currency: string;
}

export interface CreateOrderRequest {
  courseId: number;
  couponCode?: string;
  gateway: PaymentGateway;
}

export interface CreateOrderResponse {
  order: Order;
  /** Mock gateway shape — window.location-style redirect straight to our own return route. */
  redirectUrl?: string;
  /**
   * JazzCash/EasyPaisa hosted-checkout shape (server/src/adapters/payments/{jazzcash,easypaisa}.js
   * `createCheckout()`): a signed form payload that must be rendered as a hidden-input HTML
   * form (one `<input>` per `formFields` entry) and auto-submitted with `method="POST"` to
   * `actionUrl` — the gateway's own hosted page, never a plain browser redirect (the payload,
   * notably the secure hash, doesn't fit in a querystring).
   */
  actionUrl?: string;
  method?: "POST";
  formFields?: Record<string, string>;
  /** Raast / bank_transfer manual pseudo-gateway shape. */
  manualDetails?: {
    raastId: string;
    iban: string;
    accountTitle: string;
    bankName: string;
    qrImageUrl: string;
  };
}

export const checkoutApi = {
  /** GET /checkout/gateways (docs/07_EXECUTION_PLAN.md 9.7) — real enabled/configured gateway list, replacing the previously-hardcoded gatewayConfigs array in CheckoutPage.tsx. */
  async getGateways(): Promise<GatewayInfo[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return [
        { code: "jazzcash", name: "JazzCash", enabled: true },
        { code: "easypaisa", name: "EasyPaisa", enabled: true },
        { code: "raast", name: "Raast", enabled: true },
        { code: "bank_transfer", name: "Bank Transfer", enabled: true },
        { code: "payfast", name: "PayFast", enabled: false },
        { code: "safepay", name: "Safepay", enabled: false },
        { code: "mock", name: "Mock (Dev)", enabled: true },
      ];
    }
    return apiFetch<GatewayInfo[]>("/checkout/gateways");
  },

  async getQuote(req: QuoteRequest): Promise<QuoteResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      const course = MOCK_COURSES.find((c) => c.id === Number(req.courseId));
      if (!course) throw new ApiError("Course not found", "COURSE_NOT_FOUND", 404);

      let discount = 0;
      if (req.couponCode) {
        const codeUpper = req.couponCode.toUpperCase().trim();
        const coupon = MOCK_COUPONS.find((cp) => cp.code.toUpperCase() === codeUpper);
        
        if (!coupon) {
          throw new ApiError("Invalid promo coupon code.", "COUPON_INVALID", 400);
        }
        if (!coupon.isActive) {
          throw new ApiError("This coupon code has expired.", "EXPIRED", 400);
        }
        if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
          throw new ApiError("Coupon usage limit has been exhausted.", "USED_UP", 400);
        }

        if (coupon.type === "percent") {
          discount = Math.round((course.price * coupon.value) / 100);
        } else {
          discount = coupon.value;
        }
      }

      const finalAmount = Math.max(0, course.price - discount);
      return {
        courseId: course.id,
        originalPrice: course.price,
        discountAmount: discount,
        finalAmount: finalAmount,
        couponCode: req.couponCode,
        currency: "PKR",
      };
    }
    return apiFetch<QuoteResponse>("/checkout/quote", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  async createOrder(req: CreateOrderRequest): Promise<CreateOrderResponse> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 500);

      // Check placeholder gateway rule
      if (req.gateway === "payfast" || req.gateway === "safepay") {
        throw new ApiError(
          `${req.gateway.toUpperCase()} integration gateway is not configured yet in this environment.`,
          "GATEWAY_NOT_CONFIGURED",
          422
        );
      }

      const quote = await this.getQuote({ courseId: req.courseId, couponCode: req.couponCode });
      const course = MOCK_COURSES.find((c) => c.id === req.courseId)!;

      const newOrder: Order = {
        id: Math.floor(Math.random() * 9000) + 1000,
        invoiceNo: `SAMS-2026-${Math.floor(Math.random() * 90000) + 10000}`,
        userId: 1,
        userName: "Dr. Hamza Malik",
        userEmail: "student@samsacademy.com",
        courseId: course.id,
        courseTitle: course.title,
        amount: quote.originalPrice,
        discountAmount: quote.discountAmount,
        finalAmount: quote.finalAmount,
        currency: "PKR",
        couponCode: req.couponCode,
        gateway: req.gateway,
        status: req.gateway === "mock" || req.gateway === "easypaisa" || req.gateway === "jazzcash" ? "paid" : "pending",
        paidAt: req.gateway === "mock" || req.gateway === "easypaisa" || req.gateway === "jazzcash" ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
      };

      if (req.gateway === "raast" || req.gateway === "bank_transfer") {
        return {
          order: newOrder,
          manualDetails: {
            raastId: "03001234567@raast",
            iban: "PK36MEZN0001020304050607",
            accountTitle: "SAMS ACADEMY PRIVATE LIMITED",
            bankName: "Meezan Bank Limited, Main Campus Branch",
            qrImageUrl: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PK36MEZN0001020304050607&format=svg",
          },
        };
      }

      return {
        order: newOrder,
        redirectUrl: `/order/${newOrder.id}/status`,
      };
    }

    return apiFetch<CreateOrderResponse>("/checkout/orders", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  /**
   * POST /checkout/uploads/proof-image (multipart `file` + `orderId` fields) — real proof-image
   * upload, replacing CheckoutPage.tsx's previously-hardcoded Unsplash `fileUrl` stand-in.
   * Follows admin.ts#uploadImage's exact apiUpload/FormData pattern, plus the `orderId` field
   * this endpoint additionally requires (server/src/services/manualPaymentService.js links the
   * upload to an order immediately, at upload time).
   */
  async uploadProofImage(orderId: number, file: File): Promise<{ url: string }> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 500);
      return { url: URL.createObjectURL(file) };
    }
    const form = new FormData();
    form.append("file", file);
    form.append("orderId", String(orderId));
    return apiUpload<{ url: string }>("/checkout/uploads/proof-image", form);
  },

  async uploadBankProof(orderId: number, data: { referenceNo: string; note?: string; fileUrl: string }): Promise<Order> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 450);
      const order = MOCK_ORDERS[0];
      order.status = "awaiting_verification";
      order.proof = {
        id: Math.floor(Math.random() * 1000),
        orderId,
        filePath: data.fileUrl,
        referenceNo: data.referenceNo,
        note: data.note,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      return order;
    }
    return apiFetch<Order>(`/checkout/orders/${orderId}/bank-proof`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getMyOrders(): Promise<Order[]> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 300);
      return MOCK_ORDERS;
    }
    return apiFetch<Order[]>("/orders");
  },

  async getOrderById(orderId: number): Promise<Order> {
    if (CONFIG.USE_MOCK) {
      await mockLatency(null, 250);
      return MOCK_ORDERS.find((o) => o.id === Number(orderId)) || MOCK_ORDERS[0];
    }
    return apiFetch<Order>(`/orders/${orderId}`);
  },
};
