export interface Voter {
  serialNo?: string;
  name?: string;
  gender?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  profession?: string;
  voterId?: string;
  address?: string;
  villageName?: string;
  remarks?: string;
  
  // Normalized / cached fields
  _isMigrated?: boolean;
  _normName?: string;
  _normFather?: string;
  _normMother?: string;
  _normDob?: string;
  _normSerial?: string;
  _age?: string;
  _profession?: string;
  _gender?: string;
  _prepared?: boolean;
}

export interface VillageSummary {
  name: string;
  total: number;
  males: number;
  females: number;
}

export type SearchFieldMode =
  | 'name'
  | 'serial'
  | 'father'
  | 'mother'
  | 'voterId'
  | 'dob'
  | 'profession'
  | 'address';

export interface AppSearchFilters {
  searchField?: SearchFieldMode;
  query?: string;
  omni?: string;
  serial: string;
  name: string;
  father: string;
  mother: string;
  dob: string;
  voterId?: string;
  address?: string;
  profession: string;
  gender: string;
  ageGroup?: AgeGroupFilter;
  campaignFilter?: CampaignStatusFilter;
  sortBy?: VoterSortOption;
}

export interface AppSettings {
  fullList: boolean;
  stats: boolean;
  migrated: boolean;
  viewMode?: VoterViewMode;
}

export interface SavedAppState {
  activeVillage: string;
  search: AppSearchFilters;
  settings: AppSettings;
}

export interface ActiveSessionInfo {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
}

export interface UserSessionData {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
  isOnline: boolean;
  durationMinutes: number;
  lastSeenSecondsAgo?: number;
}

export interface SessionHistoryItem {
  id: string;
  email: string;
  sessionId: string;
  deviceName?: string;
  loginAt: number;
  logoutAt?: number;
  durationMinutes: number;
  endReason?: 'logout' | 'another_device' | 'kicked' | 'active';
}

export interface AdminSessionsResponse {
  success: boolean;
  activeUsers: UserSessionData[];
  history: SessionHistoryItem[];
  summary: {
    totalDistinctEmails: number;
    onlineCount: number;
    totalRegisteredSessions: number;
    totalHistoryCount: number;
    avgDurationMinutes: number;
  };
}

export interface AppUserRecord {
  email: string;
  name?: string;
  phone?: string;
  notes?: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  createdAt: number;
  lastLoginAt?: number | null;
  totalMinutesSpent: number;
  currentSessionDuration?: number;
  isOnline?: boolean;
  activeSessionId?: string;
  activeSessionCount?: number;
  deviceName?: string;
  lastActive?: number;
  lastPasswordChangedAt?: number | null;
  loginCount?: number;
}

export interface UserAccessOverride {
  email: string;
  allowSlipPrint?: boolean;
  disabledVillages?: string[];
  updatedAt?: number;
  updatedBy?: string;
}

export interface AppGlobalConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcementEnabled: boolean;
  announcementText: string;
  enforceSingleDevice: boolean;
  allowSlipPrint: boolean;
  disabledVillages?: string[];
  userAccessOverrides?: Record<string, UserAccessOverride>;
  autoUpdateEnabled?: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

export interface RemoteReleaseInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  releaseNotes: string;
  publishedAt?: string;
}

export interface AppUpdatePreferences {
  autoCheckEnabled: boolean;
  autoNotifyEnabled: boolean;
  skippedVersion: string | null;
  lastCheckedAt: number | null;
}

export type ApkDownloadStatus = 'idle' | 'downloading' | 'completed' | 'error' | 'cancelled';

export interface ApkDownloadState {
  status: ApkDownloadStatus;
  versionName: string;
  apkUrl: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  errorMessage?: string | null;
  fileName?: string;
  blobUrl?: string | null;
}

export interface UpdateGraceRecord {
  versionName: string;
  firstDetectedAt: number;
}

export interface AdminPanelSummary {
  totalRegisteredUsers: number;
  onlineCount: number;
  blockedCount: number;
  adminCount?: number;
  totalCumulativeMinutes: number;
  avgMinutesPerUser: number;
}

export interface AdminPanelData {
  success: boolean;
  isAdmin: boolean;
  adminEmails: string[];
  users: AppUserRecord[];
  activeUsers: UserSessionData[];
  history: SessionHistoryItem[];
  summary: AdminPanelSummary;
  appConfig?: AppGlobalConfig;
  dataSource?: 'firebase' | 'server' | 'local';
  cloudConnected?: boolean;
  cloudError?: string | null;
  lastSyncedAt?: number;
}

export type SlipDesignStyle =
  | 'classic_voter_card'
  | 'upazila_horizontal'
  | 'poster_banner_card'
  | 'royal_framed_slip'
  | 'official_table_grid'
  | 'compact_thermal_slip';

export type VoterInfoFillMode = 'auto' | 'lined' | 'blank';

export type SlipOrientation = 'portrait' | 'landscape';
export type ThermalPaperWidthMm = 58 | 80;
export type SlipBorderStyle = 'solid' | 'double' | 'dashed' | 'none';

export interface SlipCustomSettings {
  orientation?: SlipOrientation;
  paperWidthMm?: ThermalPaperWidthMm;
  thermalColorMode?: 'bw' | 'color';
  voterOnlyMode?: boolean;
  headerFontScale?: number;
  candidateFontScale?: number;
  voterFontScale?: number;
  photoScale?: number;
  symbolScale?: number;
  lineSpacingScale?: number;
  paddingMm?: number;
  borderStyle?: SlipBorderStyle;
  swapPhotoSymbol?: boolean;
  thermalDarkness?: 'light' | 'normal' | 'dark';
  showReligiousHeader?: boolean;
  showElectionTitle?: boolean;
  showCandidatePhoto?: boolean;
  showSymbolPhoto?: boolean;
  showSlogan?: boolean;
  showPollingCenter?: boolean;
  showWardAndArea?: boolean;
  showSerial?: boolean;
  showVoterId?: boolean;
  showFather?: boolean;
  showMother?: boolean;
  showDob?: boolean;
  showProfession?: boolean;
  showAddress?: boolean;
  showFooter?: boolean;
}

export interface CandidateProfile {
  id: string;
  templateTitle?: string;
  designStyle?: SlipDesignStyle;
  voterInfoMode?: VoterInfoFillMode;
  name: string;
  postTitle?: string;
  religiousHeader: string;
  cardBadgeText?: string;
  electionTitle: string;
  constituencyText?: string;
  electionSubtitle: string;
  candidateBadge: string;
  candidateName: string;
  candidateSuffix?: string;
  candidatePhotoUrl: string;
  symbolName: string;
  symbolPhotoUrl: string;
  symbolCallout: string;
  sloganText?: string;
  pollingCenter: string;
  voterArea: string;
  wardNo: string;
  footerLeftText?: string;
  footerCenterText?: string;
  footerRightText?: string;
  customSettings?: SlipCustomSettings;
  isCustom?: boolean;
}

export type ElectionSlipConfig = CandidateProfile;

export type M3ColorPalette = 'emerald' | 'indigo' | 'amber' | 'ocean';
export type M3ThemeMode = 'light' | 'dark' | 'system';
export type M3FontScale = 'normal' | 'large';

export interface M3ThemePreferences {
  palette: M3ColorPalette;
  mode: M3ThemeMode;
  fontScale: M3FontScale;
}

export type SupportTagType = 'supporter' | 'followup' | 'neutral' | 'away' | 'elderly_care' | '';

export interface VoterAnnotation {
  key: string;
  villageName?: string;
  starred?: boolean;
  voted?: boolean;
  votedAt?: number | null;
  supportTag?: SupportTagType;
  phone?: string;
  note?: string;
  updatedBy?: string;
  updatedAt: number;
}

export type VoterSortOption = 'serial_asc' | 'serial_desc' | 'name_asc' | 'age_asc' | 'age_desc';
export type AgeGroupFilter = '' | 'youth' | 'working' | 'middle' | 'senior';
export type CampaignStatusFilter = '' | 'starred' | 'voted' | 'unvoted' | 'has_note' | 'supporter' | 'followup';
export type VoterViewMode = 'card' | 'compact';
export type AppScreenType = 'home' | 'search' | 'saved' | 'analytics';
