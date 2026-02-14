import { AuthPayload } from "../middleware/auth";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      shopId?: string;
      returnRequest?: {
        id: string;
        order_id: string;
        user_id: string;
        seller_id: string;
        status: string;
        seller_decision: string | null;
        video_proof_url: string | null;
      };
    }
  }
}

export {};
