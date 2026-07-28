// Back-compat shim. The "Other" section was generalized into
// NavigationDrawerHeroesSection (config-driven title) when the nav-sections
// framework landed. This re-export keeps the old name working for any caller that
// still imports NavigationDrawerOtherSection; it renders identically (title "Other").
export { NavigationDrawerHeroesSection as NavigationDrawerOtherSection } from '@/navigation/components/NavigationDrawerHeroesSection';
