import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json plus what depends on the build. Associated Domains tie the app to fnnzhrn.ch, so iOS
 * suggests and saves the site's passwords in the sign-in (the site serves
 * /.well-known/apple-app-site-association). Apple allows them only for paid developer accounts,
 * so builds signed with a free personal team set FNNZHRN_PERSONAL_TEAM=1 to leave them out.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.FNNZHRN_PERSONAL_TEAM === "1") return config as ExpoConfig;
  return {
    ...(config as ExpoConfig),
    ios: { ...config.ios, associatedDomains: ["webcredentials:fnnzhrn.ch", "webcredentials:www.fnnzhrn.ch"] },
  };
};
