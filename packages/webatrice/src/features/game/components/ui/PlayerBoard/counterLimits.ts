// Matches Cockatrice's counter_limits.h — Servatrice clamps card counter
// values to [0, 999] server-side. Used client-side by the "Increment all card
// counters" flow to skip counters already at the cap (matches
// actIncrementAllCardCounters at player_actions.cpp:1605).
export const MAX_COUNTER_VALUE = 999;
