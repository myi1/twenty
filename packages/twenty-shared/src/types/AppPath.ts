export enum AppPath {
  // Not logged-in
  Verify = '/verify',
  VerifyEmail = '/verify-email',
  SignInUp = '/welcome',
  Invite = '/invite/:workspaceInviteHash',
  ResetPassword = '/reset-password/:passwordResetToken',

  // Onboarding
  CreateWorkspace = '/create/workspace',
  CreateProfile = '/create/profile',
  SyncEmails = '/sync/emails',
  InviteTeam = '/invite-team',
  PlanRequired = '/plan-required',
  PlanRequiredSuccess = '/plan-required/payment-success',
  BookCallDecision = '/book-call-decision',
  BookCall = '/book-call',

  // Onboarded
  Index = '/',
  TasksPage = '/objects/tasks',
  OpportunitiesPage = '/objects/opportunities',
  Inbox = '/inbox',
  MarketingHub = '/marketing',
  MarketingCampaignBuilder = '/marketing/campaign/new',
  MarketingSequenceEditor = '/marketing/sequences',
  MarketingSocialCalendar = '/marketing/social',
  OneOnOneRunner = '/one-on-one',
  A2AStudio = '/a2a-studio',
  ListingStudio = '/listing-studio',
  SettingsHub = '/settings-hub',

  // Propel catch-all hero route. A brand-new hero added ONLY to the host-mounted
  // nav.config.json (route '/h/<bundle>') resolves at navigation time via this
  // wildcard — no engine rebuild. Existing heroes keep their explicit routes
  // above for back-compat. See modules/propel/runtime/HeroRoute (HeroCatchAllRoute).
  HeroCatchAll = '/h/:bundle',

  RecordIndexPage = '/objects/:objectNamePlural',
  RecordShowPage = '/object/:objectNameSingular/:objectRecordId',
  PageLayoutPage = '/page/:pageLayoutId',

  Settings = `settings`,
  SettingsCatchAll = `/${Settings}/*`,
  Developers = `developers`,
  DevelopersCatchAll = `/${Developers}/*`,

  Authorize = '/authorize',

  // 404 page not found
  NotFoundWildcard = '*',
  NotFound = '/not-found',
}
