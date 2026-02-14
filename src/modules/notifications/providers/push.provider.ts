export const sendPushNotification = async (input: {
  token: string;
  title: string;
  body: string;
}) => {
  if (!input.token) {
    throw new Error("Missing push token");
  }
  // Stubbed provider for now.
  return { reference: `push:${Date.now()}` };
};
