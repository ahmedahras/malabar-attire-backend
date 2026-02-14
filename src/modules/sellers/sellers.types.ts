export type ShopStatus = "active" | "inactive" | "blocked";

export type ShopPickupAddress = {
  pickupName: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

export type ShopRecord = {
  id: string;
  ownerUserId: string;
  name: string;
  district: string;
  status: ShopStatus;
  shiprocketPickupName?: string | null;
  shiprocketPickupAddress?: ShopPickupAddress | null;
  shiprocketPickupConfiguredAt?: string | null;
  createdAt: string;
};
