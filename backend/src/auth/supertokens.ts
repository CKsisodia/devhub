import supertokens from "supertokens-node";
import Session from "supertokens-node/recipe/session";
import Passwordless from "supertokens-node/recipe/passwordless";
import { TwilioService, SupertokensService } from "supertokens-node/recipe/passwordless/smsdelivery";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { normalizePhone } from "../lib/phone.js";

export const NOT_REGISTERED_MSG = "This number isn't registered. Ask your admin to add you.";
export const DEACTIVATED_MSG = "Your account has been deactivated. Contact your admin.";

/** Server-side gate: only numbers that the admin has added (and that are active) may receive a code. */
export async function checkPhoneAllowed(phoneNumber: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const e164 = normalizePhone(phoneNumber) ?? phoneNumber;
  const user = await prisma.user.findUnique({ where: { phoneNumber: e164 } });
  if (!user) return { ok: false, reason: NOT_REGISTERED_MSG };
  if (!user.active) return { ok: false, reason: DEACTIVATED_MSG };
  return { ok: true };
}

function smsDelivery() {
  const { sms } = config;
  if (sms.provider === "twilio") {
    if (!sms.twilioAccountSid || !sms.twilioAuthToken || !(sms.twilioFrom || sms.twilioMessagingServiceSid)) {
      throw new Error("SMS_PROVIDER=twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID");
    }
    const twilioSettings = sms.twilioMessagingServiceSid
      ? { accountSid: sms.twilioAccountSid, authToken: sms.twilioAuthToken, messagingServiceSid: sms.twilioMessagingServiceSid }
      : { accountSid: sms.twilioAccountSid, authToken: sms.twilioAuthToken, from: sms.twilioFrom! };
    return { service: new TwilioService({ twilioSettings }) };
  }
  if (sms.provider === "supertokens") {
    if (!sms.supertokensSmsApiKey) throw new Error("SMS_PROVIDER=supertokens needs SUPERTOKENS_SMS_API_KEY");
    return { service: new SupertokensService(sms.supertokensSmsApiKey) };
  }
  // Development default: print the OTP to the backend console instead of sending an SMS.
  return {
    override: (original: Parameters<NonNullable<NonNullable<Parameters<typeof Passwordless.init>[0]["smsDelivery"]>["override"]>>[0]) => ({
      ...original,
      sendSms: async (input: { phoneNumber: string; userInputCode?: string; codeLifetime: number }) => {
        const mins = Math.round(input.codeLifetime / 60000);
        console.log(
          `\n┌──────────────────────────────────────────────\n│ [DEV OTP] ${input.phoneNumber}  →  code: ${input.userInputCode}  (valid ${mins} min)\n└──────────────────────────────────────────────\n`,
        );
      },
    }),
  };
}

export function initSupertokens() {
  supertokens.init({
    framework: "express",
    supertokens: {
      connectionURI: config.supertokens.connectionUri,
      apiKey: config.supertokens.apiKey,
    },
    appInfo: {
      appName: config.supertokens.appName,
      apiDomain: config.apiDomain,
      websiteDomain: config.websiteDomain,
      apiBasePath: "/api/auth",
      websiteBasePath: "/login",
    },
    recipeList: [
      Passwordless.init({
        contactMethod: "PHONE",
        flowType: "USER_INPUT_CODE",
        smsDelivery: smsDelivery(),
        override: {
          apis: (original) => ({
            ...original,
            createCodePOST: async (input) => {
              if (!original.createCodePOST) throw new Error("createCodePOST disabled");
              if ("phoneNumber" in input) {
                const allowed = await checkPhoneAllowed(input.phoneNumber);
                if (!allowed.ok) return { status: "SIGN_IN_UP_NOT_ALLOWED", reason: allowed.reason };
              }
              return original.createCodePOST(input);
            },
            consumeCodePOST: async (input) => {
              if (!original.consumeCodePOST) throw new Error("consumeCodePOST disabled");
              const res = await original.consumeCodePOST(input);
              if (res.status !== "OK") return res;
              const phone = res.user.phoneNumbers[0];
              const appUser = phone ? await prisma.user.findUnique({ where: { phoneNumber: phone } }) : null;
              if (!appUser || !appUser.active) {
                await res.session.revokeSession();
                return { status: "SIGN_IN_UP_NOT_ALLOWED", reason: appUser ? DEACTIVATED_MSG : NOT_REGISTERED_MSG };
              }
              if (appUser.supertokensUserId !== res.user.id) {
                // Link (or re-link) the app user to the SuperTokens user on sign-in.
                await prisma.user.updateMany({ where: { supertokensUserId: res.user.id }, data: { supertokensUserId: null } });
                await prisma.user.update({ where: { id: appUser.id }, data: { supertokensUserId: res.user.id } });
              }
              return res;
            },
          }),
        },
      }),
      Session.init({
        exposeAccessTokenToFrontendInCookieBasedAuth: false,
      }),
    ],
  });
}

export async function revokeSessionsFor(supertokensUserId: string | null) {
  if (!supertokensUserId) return;
  await Session.revokeAllSessionsForUser(supertokensUserId);
}
