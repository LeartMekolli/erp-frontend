/** Messages shared by the sign-in pages' forms. */
export const OFFLINE = "You're offline. Check your connection and try again.";
export const UNREACHABLE = "AMI can't reach the server right now. Try again in a moment.";
export const UNKNOWN = "Something went wrong. Try again.";

/** A request that never got an answer: the browser is offline, or the server can't be reached. */
export const noAnswer = () => (navigator.onLine ? UNREACHABLE : OFFLINE);
