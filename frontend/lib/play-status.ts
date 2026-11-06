/**
 * The switch for starting games. While it is true:
 *
 * - every Play button is disabled rather than linked,
 * - /game and /lobby render PlayPausedScreen instead of mounting the game, so
 *   nothing loads Google Maps or Street View and no game is started, whichever
 *   link a visitor arrived by,
 * - the home page says why.
 *
 * Paused while the Google Cloud billing behind Street View is sorted out. Set
 * it back to false to reopen play; nothing else needs to change.
 *
 * Typed as boolean so the code behind each branch still typechecks while the
 * value sits on one side.
 */
export const PLAY_PAUSED: boolean = true;
