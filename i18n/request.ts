import { getRequestConfig } from "next-intl/server";

/** English only for now, with every interface string in messages/ so languages can be added (D004). */
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../messages/en.json")).default,
}));
