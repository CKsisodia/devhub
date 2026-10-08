"use client";

import SuperTokens from "supertokens-web-js";
import Session from "supertokens-web-js/recipe/session";
import Passwordless from "supertokens-web-js/recipe/passwordless";

let initialised = false;

/**
 * The API is reached through this app's own origin (/api/* is proxied to the backend by next.config.ts),
 * so apiDomain is simply the current origin.
 */
export function initSuperTokens() {
  if (initialised || typeof window === "undefined") return;
  SuperTokens.init({
    appInfo: {
      appName: process.env.NEXT_PUBLIC_APP_NAME || "FE Panel",
      apiDomain: window.location.origin,
      apiBasePath: "/api/auth",
    },
    recipeList: [Session.init(), Passwordless.init()],
  });
  initialised = true;
}
