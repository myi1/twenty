import { Helmet } from 'react-helmet-async';

type PageTitleProps = {
  title: string;
};

// The product / browser-tab base name. Every page title is composed as
// `<page> · Propel` so the RE/MAX Hub CRM branding is always present in the tab.
const APP_TITLE_BASE = 'Propel';

export const getPageTitle = (title: string): string => {
  const trimmed = title.trim();

  if (trimmed === '' || trimmed === APP_TITLE_BASE) {
    return APP_TITLE_BASE;
  }

  // Avoid double-suffixing if a caller already appended the base name.
  if (trimmed.endsWith(`· ${APP_TITLE_BASE}`)) {
    return trimmed;
  }

  return `${trimmed} · ${APP_TITLE_BASE}`;
};

export const PageTitle = (props: PageTitleProps) => {
  return (
    <Helmet>
      <title>{getPageTitle(props.title)}</title>
    </Helmet>
  );
};
