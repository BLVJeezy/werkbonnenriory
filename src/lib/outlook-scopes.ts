export const OUTLOOK_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read"];
/** The werkbon mailbox (info@riory.be) also needs to send mail. */
export const WERKBON_MAIL_SCOPES = [...OUTLOOK_SCOPES, "Mail.Send"];
