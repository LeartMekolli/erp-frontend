/** A line's or job's tab row: it scrolls sideways where the tabs don't fit, as the Orders tabs do. */
export const TAB_ROW = "h-auto! w-full justify-start overflow-x-auto [scrollbar-width:none]";

/** One tab, 44 px tall. The underline sits inside the tab, so the scrolling row doesn't clip it. */
export const TAB = "h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink";
