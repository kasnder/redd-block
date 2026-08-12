// The screen list for the UI screenshot harness (scripts/ui/shoot.mjs).
//
// One entry per screenshot. Adding a screen should mean adding an object here,
// not editing the driver.
//
// `platform` matters more than it looks: detectPlatform() falls through to its
// final branch on Linux and stamps `body.windows`, so an unstamped screenshot
// taken in CI or a container is silently a Windows screenshot. Naming the
// platform per screen is also how the mobile cases become visible at all —
// hover-dependent affordances (native `title` tooltips) do not exist on iOS or
// Android, and only show up as missing when the page is rendered as those.

import { fixtures } from './fixtures.js';

/**
 * @typedef {object} Screen
 * @property {string}   name      output filename stem
 * @property {object}   fixture   appData to boot with
 * @property {string}  [platform] 'windows' | 'mac' | 'ios' | 'android'
 * @property {string}  [theme]    'light' | 'dark'
 * @property {object}  [viewport] { width, height }
 * @property {string}  [clip]     selector to screenshot instead of the page
 * @property {Function} [prepare] async (page) => {} run after render, before the shot
 */

/** @type {Screen[]} */
export const screens = [
    {
        name: 'week-crowded',
        fixture: fixtures.crowdedWeek,
        platform: 'windows',
        clip: '.week-calendar-section',
    },
    {
        name: 'week-crowded-dark',
        fixture: fixtures.crowdedWeek,
        platform: 'windows',
        theme: 'dark',
        clip: '.week-calendar-section',
    },
    {
        // The tooltip fallback for label-free bars is hover-only, so this is the
        // case where a compact bar carries no recoverable identity at all.
        name: 'week-crowded-ios',
        fixture: fixtures.crowdedWeek,
        platform: 'ios',
        clip: '.week-calendar-section',
    },
    {
        name: 'week-crowded-android',
        fixture: fixtures.crowdedWeek,
        platform: 'android',
        clip: '.week-calendar-section',
    },
    {
        name: 'week-single',
        fixture: fixtures.singleSchedule,
        platform: 'windows',
        clip: '.week-calendar-section',
    },
];
