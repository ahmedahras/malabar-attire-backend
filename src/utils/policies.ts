export type UserContext = {
  id: string;
  role: "customer" | "shop_owner" | "admin";
};

export type OrderContext = {
  userId: string;
  sellerId: string;
};

export type ReturnContext = {
  userId: string;
  sellerId: string;
  status: string;
  sellerDecision: string | null;
};

export const canAccessOrder = (user: UserContext, order: OrderContext) => {
  if (user.role === "admin") {
    return true;
  }
  if (user.role === "customer") {
    return order.userId === user.id;
  }
  if (user.role === "shop_owner") {
    return order.sellerId === user.id;
  }
  return false;
};

export const canModifyReturn = (user: UserContext, request: ReturnContext) => {
  if (user.role === "admin") {
    return true;
  }
  if (user.role === "customer") {
    return request.userId === user.id;
  }
  if (user.role === "shop_owner") {
    return request.sellerId === user.id;
  }
  return false;
};

export const canIssueRefund = (user: UserContext, source: "return") => {
  if (source === "return") {
    return user.role === "admin";
  }
  return false;
};
