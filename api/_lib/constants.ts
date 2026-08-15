/** Shared constants for the Edge Functions (mirrored from chiaotu/src/constants.ts and friend-cats). */

/** Disguise subscription fetches as a ClashMetaForAndroid client. */
export const USER_AGENT = "ClashMetaForAndroid/2.11.19";

/** Content size cap for url fetches and subscription/generated bodies (1MB, user decision). */
export const MAX_CONTENT_SIZE = 1 << 20; // 1 MB
