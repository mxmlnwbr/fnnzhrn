/** The iOS app: Apple team id and bundle id, as in mobile/app.json (`ios.appleTeamId`, `ios.bundleIdentifier`). */
export const IOS_APP_ID = "TN7NQ7Q5J4.ch.fnnzhrn.app";

/** Served at /.well-known/apple-app-site-association; pairs with `associatedDomains` in mobile/app.config.ts. */
export const APP_SITE_ASSOCIATION = {
  webcredentials: { apps: [IOS_APP_ID] },
};
